import { App, PluginSettingTab, Setting, TextComponent } from 'obsidian';
// Test 2: Consistency validation
import type { AIProvider, TitleGeneratorSettings } from './types';
import type TitleGeneratorPlugin from './main';
import { ModelService } from './modelService';

export const AI_PROVIDERS: Record<
  AIProvider,
  { name: string; requiresApiKey: boolean }
> = {
  openai: {
    name: 'OpenAI',
    requiresApiKey: true,
  },
  anthropic: {
    name: 'Anthropic',
    requiresApiKey: true,
  },
  google: {
    name: 'Google Gemini',
    requiresApiKey: true,
  },
};

export const DEFAULT_SETTINGS: TitleGeneratorSettings = {
  // Provider
  aiProvider: 'openai',
  openAiApiKey: '',
  anthropicApiKey: '',
  googleApiKey: '',

  // Models
  openAiModel: '',
  anthropicModel: '',
  googleModel: '',

  // Dynamic Model Caching
  cachedModels: {
    openai: { models: [], lastUpdated: 0 },
    anthropic: { models: [], lastUpdated: 0 },
    google: { models: [], lastUpdated: 0 },
  },
  modelLoadingState: {
    openai: false,
    anthropic: false,
    google: false,
  },

  // Title
  lowerCaseTitles: false,
  removeForbiddenChars: true,
  /** Enable detailed console log output for debugging */
  debugMode: false,

  // Prompt and Content
  customPrompt:
    'Create a concise title for this text. Respond with ONLY the title - no explanations, quotes, or extra text. Maximum {max_length} characters.',
  refinePrompt:
    'Make this title shorter (under {max_length} characters): "{title}". Respond with ONLY the new title.',
  temperature: 0.3,
  maxTitleLength: 60,
  maxContentLength: 2000,
};

export class TitleGeneratorSettingTab extends PluginSettingTab {
  plugin: TitleGeneratorPlugin;
  modelService: ModelService;

  constructor(app: App, plugin: TitleGeneratorPlugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.modelService = new ModelService(
      () => this.plugin.settings,
      () => this.plugin.saveSettings()
    );
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Enhanced Title Generator Settings' });

    /* --- General Settings --- */
    containerEl.createEl('h3', { text: 'General' });

    new Setting(containerEl)
      .setName('Lower-case titles')
      .setDesc(
        'If enabled, all generated titles will be converted to lower case.'
      )
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.lowerCaseTitles)
          .onChange(async (value) => {
            this.plugin.settings.lowerCaseTitles = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Remove forbidden characters')
      .setDesc(
        'If enabled, characters that are forbidden in filenames will be removed.'
      )
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.removeForbiddenChars)
          .onChange(async (value) => {
            this.plugin.settings.removeForbiddenChars = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Debug mode')
      .setDesc('Enable detailed console logging for troubleshooting.')
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.debugMode)
          .onChange(async (value) => {
            this.plugin.settings.debugMode = value;
            await this.plugin.saveSettings();
          });
      });

    /* --- AI Provider Settings --- */
    containerEl.createEl('h3', { text: 'AI Provider' });

    new Setting(containerEl)
      .setName('AI Provider')
      .setDesc('Select the AI service you want to use to generate titles.')
      .addDropdown((dropdown) => {
        Object.entries(AI_PROVIDERS).forEach(([key, provider]) => {
          dropdown.addOption(key, provider.name);
        });
        dropdown
          .setValue(this.plugin.settings.aiProvider)
          .onChange(async (value) => {
            this.plugin.settings.aiProvider = value as AIProvider;
            await this.plugin.saveSettings();
            this.display(); // Re-render the settings tab
          });
      });

    this.renderProviderSettings(containerEl);

    /* --- Prompt and Content Settings --- */
    containerEl.createEl('h3', { text: 'Prompts and Content' });

    new Setting(containerEl)
      .setName('Initial Prompt')
      .setDesc(
        'The prompt sent to the AI. Use {max_length} to insert the max title length.'
      )
      .addTextArea((ta) => {
        ta.setPlaceholder(DEFAULT_SETTINGS.customPrompt)
          .setValue(this.plugin.settings.customPrompt)
          .onChange(async (value) => {
            this.plugin.settings.customPrompt = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Refinement Prompt')
      .setDesc(
        'The prompt used to shorten a title if it exceeds the length limit. Use {max_length} and {title}.'
      )
      .addTextArea((ta) => {
        ta.setPlaceholder(DEFAULT_SETTINGS.refinePrompt)
          .setValue(this.plugin.settings.refinePrompt)
          .onChange(async (value) => {
            this.plugin.settings.refinePrompt = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Temperature')
      .setDesc(
        'Controls the creativity of the AI. Lower values are more predictable, higher values are more creative.'
      )
      .addSlider((slider) => {
        slider
          .setLimits(0, 1, 0.01)
          .setValue(this.plugin.settings.temperature)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.temperature = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Max Title Length')
      .setDesc('The maximum number of characters for the generated title.')
      .addText((text) => {
        text.inputEl.type = 'number';
        text
          .setValue(this.plugin.settings.maxTitleLength.toString())
          .onChange(async (value) => {
            const parsed = parseInt(value, 10);
            if (!isNaN(parsed)) {
              this.plugin.settings.maxTitleLength = parsed;
              await this.plugin.saveSettings();
            }
          });
      });

    new Setting(containerEl)
      .setName('Max Content Length for AI')
      .setDesc(
        'The maximum number of characters from the note to send to the AI. Helps save costs on long notes.'
      )
      .addText((text) => {
        text.inputEl.type = 'number';
        text
          .setValue(this.plugin.settings.maxContentLength.toString())
          .onChange(async (value) => {
            const parsed = parseInt(value, 10);
            if (!isNaN(parsed)) {
              this.plugin.settings.maxContentLength = parsed;
              await this.plugin.saveSettings();
            }
          });
      });
  }

  private renderProviderSettings(containerEl: HTMLElement): void {
    const provider = this.plugin.settings.aiProvider;
    const providerInfo = AI_PROVIDERS[provider];

    // API Key input
    if (providerInfo.requiresApiKey) {
      const keyName = provider === 'openai' ? 'openAiApiKey' : `${provider}ApiKey` as keyof TitleGeneratorSettings;
      let initialValue = this.plugin.settings[keyName] as string;
      let currentValue = initialValue;
      let textEl: any, cancelBtn: any, okBtn: any;
      const apiKeySetting = new Setting(containerEl)
        .setName(`${providerInfo.name} API Key`)
        .setDesc(`Your ${providerInfo.name} API key.`);
      apiKeySetting.addText((text) => {
        textEl = text;
        text.setPlaceholder('Enter API key')
          .setValue(initialValue)
          .onChange((value) => {
            currentValue = value;
            const changed = currentValue !== initialValue;
            cancelBtn.setDisabled(!changed);
            okBtn.setDisabled(!changed);
          });
      });
      apiKeySetting.addButton((btn) => {
        cancelBtn = btn;
        btn.setButtonText('Cancel')
          .setDisabled(true)
          .onClick(() => {
            textEl.setValue(initialValue);
            currentValue = initialValue;
            cancelBtn.setDisabled(true);
            okBtn.setDisabled(true);
          });
      });
      apiKeySetting.addButton((btn) => {
        okBtn = btn;
        btn.setButtonText('OK')
          .setDisabled(true)
          .onClick(async () => {
            (this.plugin.settings as any)[keyName] = currentValue;
            await this.plugin.saveSettings();
            initialValue = currentValue;
            cancelBtn.setDisabled(true);
            okBtn.setDisabled(true);
          });
      });
    }

    // Model selection with reload button
    this.renderModelSelection(containerEl, provider, providerInfo);
  }

  private async renderModelSelection(
    containerEl: HTMLElement,
    provider: AIProvider,
    providerInfo: { name: string; requiresApiKey: boolean }
  ): Promise<void> {
    let modelName: keyof TitleGeneratorSettings;
    switch (provider) {
      case 'openai':
        modelName = 'openAiModel';
        break;
      case 'anthropic':
        modelName = 'anthropicModel';
        break;
      case 'google':
        modelName = 'googleModel';
        break;
      default:
        return; // Should not happen
    }

    const currentModel = this.plugin.settings[modelName] as string;
    const isLoading = this.modelService.isLoading(provider);
    const cachedInfo = this.modelService.getCachedInfo(provider);

    // Model selection setting
    const modelSetting = new Setting(containerEl)
      .setName('Model')
      .setDesc(`The ${providerInfo.name} model to use for generation.`);

    // Add model search component
    this.createModelSearchComponent(modelSetting.controlEl, provider);

    // Add reload button
    modelSetting.addButton((btn) => {
      btn
        .setIcon('refresh-cw')
        .setTooltip('Reload models')
        .setDisabled(isLoading)
        .onClick(async () => {
          btn.setDisabled(true);
          try {
            await this.modelService.refreshModels(provider);
            // Re-render the entire settings tab to reflect the new models
            this.display();
          } catch (error) {
            console.error('Failed to reload models:', error);
          } finally {
            btn.setDisabled(false);
          }
        });
    });

    // Add cache info
    if (cachedInfo) {
      const lastUpdated = new Date(cachedInfo.lastUpdated);
      const timeAgo = this.getTimeAgo(lastUpdated);

      let desc = `The ${providerInfo.name} model to use for generation.`;
      if (cachedInfo.error) {
        desc += ` Error: ${cachedInfo.error}`;
      } else if (cachedInfo.models.length > 0) {
        desc += ` (${cachedInfo.models.length} models, updated ${timeAgo})`;
      }

      modelSetting.setDesc(desc);
    }
  }

  private createModelSearchComponent(
    containerEl: HTMLElement,
    provider: AIProvider
  ): void {
    let modelName: keyof TitleGeneratorSettings;
    switch (provider) {
      case 'openai':
        modelName = 'openAiModel';
        break;
      case 'anthropic':
        modelName = 'anthropicModel';
        break;
      case 'google':
        modelName = 'googleModel';
        break;
      default:
        return;
    }
    const currentModel = this.plugin.settings[modelName] as string;
    const isLoading = this.modelService.isLoading(provider);

    containerEl.addClass('model-search-container');

    const searchInput = new TextComponent(containerEl)
      .setPlaceholder('Search or select a model...')
      .setValue(currentModel);

    const resultsEl = containerEl.createDiv('search-results');
    resultsEl.style.display = 'none'; // Initially hidden

    const populateList = async (filter: string) => {
      // We pass the *currently selected* model to populateModelList
      // so it can be highlighted, but the input might have a different value
      // which is used as the filter.
      const selectedModel = this.plugin.settings[modelName] as string;
      await this.populateModelList(
        resultsEl,
        provider,
        selectedModel,
        isLoading,
        filter
      );
    };

    searchInput.inputEl.addEventListener('focus', () => {
      resultsEl.style.display = 'block';
      populateList(searchInput.getValue());
    });

    searchInput.inputEl.addEventListener('blur', () => {
      // Delay to allow click on results
      setTimeout(() => {
        resultsEl.style.display = 'none';
      }, 150);
    });

    searchInput.onChange(populateList);
  }

  private async populateModelList(
    listEl: HTMLElement,
    provider: AIProvider,
    currentModel: string,
    isLoading: boolean,
    filter: string = ''
  ): Promise<void> {
    listEl.empty();

    if (isLoading) {
      listEl.createDiv({ text: 'Loading models...' });
      return;
    }

    const availableModels = (
      await this.modelService.getModels(provider)
    ).filter((m) => m.toLowerCase().includes(filter.toLowerCase()));

    let modelName: keyof TitleGeneratorSettings;
    switch (provider) {
      case 'openai':
        modelName = 'openAiModel';
        break;
      case 'anthropic':
        modelName = 'anthropicModel';
        break;
      case 'google':
        modelName = 'googleModel';
        break;
      default:
        return; // Should not happen
    }

    // Ensure the currently saved model is always in the list if it matches the filter,
    // or if there is no filter.
    if (
      currentModel &&
      !availableModels.includes(currentModel) &&
      currentModel.toLowerCase().includes(filter.toLowerCase())
    ) {
      availableModels.unshift(currentModel);
    }

    if (availableModels.length === 0) {
      const cachedInfo = this.modelService.getCachedInfo(provider);
      if (cachedInfo?.error) {
        listEl.createDiv({
          text: `Error: ${cachedInfo.error.substring(0, 50)}...`,
        });
      } else if (filter) {
        listEl.createDiv({ text: 'No matching models found.' });
      } else {
        listEl.createDiv({ text: 'Click refresh icon to load models' });
      }
      return;
    }

    availableModels.forEach((model) => {
      const modelEl = listEl.createDiv({
        text: model,
        cls: 'search-result-item',
      });
      if (model === currentModel) {
        modelEl.addClass('is-selected');
      }
      modelEl.addEventListener('mousedown', async (e) => {
        e.preventDefault(); // Prevent blur event from firing too early
        (this.plugin.settings as any)[modelName] = model;
        await this.plugin.saveSettings();
        this.display(); // Re-render to show selection and update input
      });
    });
  }

  private getTimeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  }

  private hasValidConfiguration(provider: AIProvider): boolean {
    const settings = this.plugin.settings;

    switch (provider) {
      case 'openai':
        return !!settings.openAiApiKey.trim();
      case 'anthropic':
        return !!settings.anthropicApiKey.trim();
      case 'google':
        return !!settings.googleApiKey.trim();
      default:
        return false;
    }
  }

  
}
