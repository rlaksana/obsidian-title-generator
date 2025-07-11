#!/usr/bin/env node

const readline = require('readline');
const fs = require('fs');
const path = require('path');

// Test configuration
const TEST_CONFIG = {
  openai: {
    apiKey: '',
    model: 'gpt-4o-mini',
    url: 'https://api.openai.com/v1/models'
  },
  anthropic: {
    apiKey: '',
    model: 'claude-3-haiku-20240307',
    url: 'https://api.anthropic.com/v1/models'
  },
  google: {
    apiKey: '',
    model: 'gemini-1.5-flash-latest',
    url: 'https://generativelanguage.googleapis.com/v1beta/models'
  },
  ollama: {
    url: 'http://localhost:11434',
    model: 'llama3',
    endpoint: '/api/tags'
  },
  lmstudio: {
    url: 'http://192.168.68.145:1234',
    model: 'llama-3',
    endpoint: '/v1/models'
  }
};

// AI Service functions (extracted from plugin)
class AIServiceTester {
  constructor() {
    this.config = TEST_CONFIG;
  }

  async testOpenAIModels(apiKey) {
    if (!apiKey.trim()) {
      throw new Error('OpenAI API key not set');
    }

    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      
      if (!data.data || !Array.isArray(data.data)) {
        throw new Error('Invalid response format from OpenAI API');
      }

      return data.data
        .filter((model) => model.id && model.id.includes('gpt'))
        .map((model) => model.id)
        .sort();
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Request timed out. Please check your internet connection.');
      }
      throw error;
    }
  }

  async testAnthropicModels() {
    // Anthropic doesn't have a public models API, return static list
    return [
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307',
      'claude-3-5-sonnet-20240620',
    ];
  }

  async testGoogleModels(apiKey) {
    if (!apiKey.trim()) {
      throw new Error('Google API key not set');
    }

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
        {
          signal: AbortSignal.timeout(10000),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Google API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      
      if (!data.models || !Array.isArray(data.models)) {
        throw new Error('Invalid response format from Google API');
      }

      return data.models
        .filter((model) => model.supportedGenerationMethods?.includes('generateContent'))
        .map((model) => model.name.replace('models/', ''))
        .sort();
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Request timed out. Please check your internet connection.');
      }
      throw error;
    }
  }

  async testOllamaModels(url) {
    if (!url.trim()) {
      throw new Error('Ollama URL not set');
    }

    try {
      const response = await fetch(new URL('/api/tags', url).toString(), {
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      
      if (!data.models || !Array.isArray(data.models)) {
        throw new Error('Invalid response format from Ollama API');
      }

      return data.models
        .filter((model) => model.name)
        .map((model) => model.name)
        .sort();
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Request timed out. Please check if Ollama is running.');
      }
      throw error;
    }
  }

  async testLMStudioModels(url) {
    if (!url.trim()) {
      throw new Error('LM Studio URL not set');
    }

    try {
      const response = await fetch(new URL('/v1/models', url).toString(), {
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LM Studio API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      
      if (!data.data || !Array.isArray(data.data)) {
        throw new Error('Invalid response format from LM Studio API');
      }

      return data.data
        .filter((model) => model.id)
        .map((model) => model.id)
        .sort();
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Request timed out. Please check if LM Studio server is running.');
      }
      
      throw error;
    }
  }

  async testTitleGeneration(provider, model, content, apiKey, url) {
    const prompt = `Generate a concise, descriptive title for the following text. The title must be a maximum of 200 characters: ${content}`;
    
    try {
      switch (provider) {
        case 'openai':
          return await this.testOpenAIGeneration(apiKey, model, prompt);
        case 'anthropic':
          return await this.testAnthropicGeneration(apiKey, model, prompt);
        case 'google':
          return await this.testGoogleGeneration(apiKey, model, prompt);
        case 'ollama':
          return await this.testOllamaGeneration(url, model, prompt);
        case 'lmstudio':
          return await this.testLMStudioGeneration(url, model, prompt);
        default:
          throw new Error(`Unsupported provider: ${provider}`);
      }
    } catch (error) {
      throw new Error(`Title generation failed: ${error.message}`);
    }
  }

  async testOpenAIGeneration(apiKey, model, prompt) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 100,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content.trim();
  }

  async testOllamaGeneration(url, model, prompt) {
    const response = await fetch(new URL('/api/generate', url).toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        prompt: prompt,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    return data.response.trim();
  }

  async testLMStudioGeneration(url, model, prompt) {
    const response = await fetch(new URL('/v1/chat/completions', url).toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 100,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LM Studio API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content.trim();
  }
}

// CLI Interface
class CLITester {
  constructor() {
    this.aiService = new AIServiceTester();
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  async question(prompt) {
    return new Promise((resolve) => {
      this.rl.question(prompt, resolve);
    });
  }

  async showMenu() {
    console.log('\n=== AI Service Tester ===');
    console.log('1. Test OpenAI Models');
    console.log('2. Test Anthropic Models');
    console.log('3. Test Google Models');
    console.log('4. Test Ollama Models');
    console.log('5. Test LM Studio Models');
    console.log('6. Test Title Generation');
    console.log('7. Exit');
    
    const choice = await this.question('\nSelect option (1-7): ');
    return choice.trim();
  }

  async testModels(provider) {
    console.log(`\n--- Testing ${provider.toUpperCase()} Models ---`);
    
    try {
      let models;
      switch (provider) {
        case 'openai':
          const openaiKey = await this.question('Enter OpenAI API key: ');
          models = await this.aiService.testOpenAIModels(openaiKey);
          break;
        case 'anthropic':
          models = await this.aiService.testAnthropicModels();
          break;
        case 'google':
          const googleKey = await this.question('Enter Google API key: ');
          models = await this.aiService.testGoogleModels(googleKey);
          break;
        case 'ollama':
          const ollamaUrl = await this.question(`Enter Ollama URL [${TEST_CONFIG.ollama.url}]: `) || TEST_CONFIG.ollama.url;
          models = await this.aiService.testOllamaModels(ollamaUrl);
          break;
        case 'lmstudio':
          const lmstudioUrl = await this.question(`Enter LM Studio URL [${TEST_CONFIG.lmstudio.url}]: `) || TEST_CONFIG.lmstudio.url;
          models = await this.aiService.testLMStudioModels(lmstudioUrl);
          break;
      }

      console.log(`\n✅ Found ${models.length} models:`);
      models.forEach((model, index) => {
        console.log(`${index + 1}. ${model}`);
      });
    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
    }
  }

  async testTitleGeneration() {
    console.log('\n--- Test Title Generation ---');
    
    const provider = await this.question('Provider (openai/anthropic/google/ollama/lmstudio): ');
    const model = await this.question('Model name: ');
    const content = await this.question('Content to generate title for: ');
    
    let apiKey = '';
    let url = '';
    
    if (['openai', 'anthropic', 'google'].includes(provider)) {
      apiKey = await this.question(`Enter ${provider} API key: `);
    } else {
      url = await this.question(`Enter ${provider} URL: `);
    }
    
    try {
      console.log('\n🔄 Generating title...');
      const title = await this.aiService.testTitleGeneration(provider, model, content, apiKey, url);
      console.log(`\n✅ Generated title: "${title}"`);
    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
    }
  }

  async run() {
    console.log('🚀 AI Service Tester - Test plugin functionality without reloading!');
    
    while (true) {
      const choice = await this.showMenu();
      
      switch (choice) {
        case '1':
          await this.testModels('openai');
          break;
        case '2':
          await this.testModels('anthropic');
          break;
        case '3':
          await this.testModels('google');
          break;
        case '4':
          await this.testModels('ollama');
          break;
        case '5':
          await this.testModels('lmstudio');
          break;
        case '6':
          await this.testTitleGeneration();
          break;
        case '7':
          console.log('👋 Goodbye!');
          this.rl.close();
          return;
        default:
          console.log('❌ Invalid choice, please try again.');
      }
    }
  }
}

// Run the CLI tester
if (require.main === module) {
  const tester = new CLITester();
  tester.run().catch(console.error);
}

module.exports = { AIServiceTester, CLITester };