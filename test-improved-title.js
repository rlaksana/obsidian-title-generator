#!/usr/bin/env node

// Quick test script for improved title generation
const { AIServiceTester } = require('./test-cli.js');

async function testTitleGeneration() {
  console.log('🧪 Testing improved title generation...\n');
  
  const tester = new AIServiceTester();
  
  // Test cases
  const testCases = [
    {
      content: 'This is a comprehensive guide about how to set up and configure LM Studio for local AI model inference. We will cover installation, model loading, server configuration, and troubleshooting common issues.',
      expected: 'Short, descriptive title'
    },
    {
      content: 'Let me think about this problem. The user wants a solution for managing their productivity. Looking at the requirements, I need to create a system that helps with task management and time tracking.',
      expected: 'Clean title without thinking process'
    }
  ];
  
  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    console.log(`Test ${i + 1}: ${testCase.expected}`);
    console.log(`Content: ${testCase.content.substring(0, 100)}...`);
    
    try {
      const title = await tester.testLMStudioGeneration(
        'http://192.168.68.145:1234',
        'llama-3',
        `Create a concise title for this text. Respond with ONLY the title - no explanations, quotes, or extra text. Maximum 60 characters.\n\n${testCase.content}`
      );
      
      console.log(`✅ Generated title: "${title}"`);
      console.log(`   Length: ${title.length} characters`);
      
      // Test clean response function
      const cleaned = cleanAIResponse(title);
      console.log(`   Cleaned: "${cleaned}"`);
      console.log(`   Cleaned length: ${cleaned.length} characters\n`);
      
    } catch (error) {
      console.error(`❌ Error: ${error.message}\n`);
    }
  }
}

// Copy of the cleanAIResponse function for testing
function cleanAIResponse(response) {
  if (!response) return '';
  
  console.log('Raw AI response:', response);
  
  let cleaned = response.trim();
  
  // Remove common AI thinking patterns (more comprehensive)
  cleaned = cleaned.replace(/^(Let me think|I need to|Okay,|The user wants|Looking at|Based on|Here's|This|A good title|I'll|I would).*$/gm, '');
  
  // Remove partial sentences and fragments
  cleaned = cleaned.replace(/^(s related to|related to|mentions|specifically|about|regarding).*$/gi, '');
  
  // Remove explanations in parentheses or brackets
  cleaned = cleaned.replace(/\([^)]*\)/g, '');
  cleaned = cleaned.replace(/\[[^\]]*\]/g, '');
  
  // Remove common prefixes
  cleaned = cleaned.replace(/^(Title:|Generated title:|Suggested title:|The title:|A title:|Here's the title:)\s*/i, '');
  
  // Remove trailing fragments like dashes and incomplete words
  cleaned = cleaned.replace(/[-\s]*$/g, '');
  cleaned = cleaned.replace(/^[-\s]*/g, '');
  
  // Take only the first line (in case there are multiple lines)
  cleaned = cleaned.split('\n')[0];
  
  // Remove extra whitespace
  cleaned = cleaned.trim();
  
  // If result is too short, malformed, or contains fragments, try to extract better title
  if (cleaned.length < 3 || cleaned.startsWith('s ') || /^(related|mentions|specifically|about)/i.test(cleaned)) {
    console.log('Poor quality result, trying extraction methods...');
    
    // Look for quoted text first
    const quotedMatch = response.match(/["']([^"']{5,})["']/);
    if (quotedMatch && quotedMatch[1]) {
      cleaned = quotedMatch[1].trim();
      console.log('Found quoted title:', cleaned);
    } else {
      // Look for complete sentences or phrases that look like titles
      const sentences = response.split(/[.!?]/).map(s => s.trim()).filter(s => s.length > 5);
      
      for (const sentence of sentences) {
        // Skip thinking sentences
        if (!/^(Let me|I need|Okay|The user|Looking|Based|Here's|This|s related)/i.test(sentence)) {
          // Clean the sentence
          let candidate = sentence.replace(/^(Title:|Generated title:|Suggested title:)\s*/i, '').trim();
          if (candidate.length >= 5 && candidate.length <= 80) {
            cleaned = candidate;
            console.log('Found sentence title:', cleaned);
            break;
          }
        }
      }
      
      // If still poor, try to extract the most substantial part
      if (cleaned.length < 5) {
        const words = response.split(/\s+/).filter(w => w.length > 2);
        if (words.length >= 3) {
          cleaned = words.slice(0, 8).join(' '); // Take first 8 meaningful words
          console.log('Fallback word extraction:', cleaned);
        }
      }
    }
  }
  
  // Final cleanup
  cleaned = cleaned.replace(/^(s |related to |mentions |specifically |about )/i, '');
  cleaned = cleaned.replace(/[-\s]*$/g, '');
  cleaned = cleaned.trim();
  
  console.log('Final cleaned title:', cleaned);
  return cleaned;
}

if (require.main === module) {
  testTitleGeneration().catch(console.error);
}