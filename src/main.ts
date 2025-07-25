import { App, Editor, Notice, Plugin, TFile, normalizePath } from 'obsidian';
import path from 'path-browserify';
import { AIService } from './aiService';
import { DEFAULT_SETTINGS, TitleGeneratorSettingTab } from './settings';
import { initializeLogger, getLogger, updateLoggerConfig } from './logger';
import { initializeErrorHandler, getErrorHandler } from './errorHandler';
import { initializeValidationService, getValidationService } from './validation';
import { PLUGIN_NAME, UI_CONFIG } from './constants';
import type { TitleGeneratorSettings, FileOperationResult, BatchOperationProgress } from './types';



export default class TitleGeneratorPlugin extends Plugin {
  settings: TitleGeneratorSettings;
  aiService: AIService;
  private logger = initializeLogger({ debugMode: false, pluginName: PLUGIN_NAME });
  private errorHandler = initializeErrorHandler();
  private validationService = initializeValidationService();

  async onload() {
    try {
      await this.loadSettings();
      this.addStyles();

      // Update logger with current debug mode setting
      updateLoggerConfig({ debugMode: this.settings.debugMode });

      // Initialize AI service with enhanced error handling
      this.aiService = new AIService(() => this.settings);

      this.addCommand({
      id: 'generate-title',
      name: 'Generate title for current note',
      editorCallback: (editor: Editor) => this.generateTitleForEditor(editor),
    });

    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        if (file instanceof TFile && file.extension === 'md') {
          menu.addItem((item) =>
            item
              .setTitle('Generate title')
              .setIcon('lucide-edit-3')
              .onClick(() => this.generateTitleForFile(file))
          );
        }
      })
    );

    this.registerEvent(
      this.app.workspace.on('files-menu', (menu, files) => {
        const markdownFiles = files.filter(
          (f) => f instanceof TFile && f.extension === 'md'
        ) as TFile[];

        if (markdownFiles.length > 0) {
          menu.addItem((item) =>
            item
              .setTitle(`Generate titles for ${markdownFiles.length} notes`)
              .setIcon('lucide-edit-3')
              .onClick(() => this.generateTitlesForMultipleFiles(markdownFiles))
          );
        }
      })
    );

      this.addSettingTab(new TitleGeneratorSettingTab(this.app, this));
      this.logger.info('Plugin loaded successfully');
    } catch (error) {
      this.errorHandler.handleError(error as Error, { context: 'plugin-onload' });
    }
  }

  addStyles() {
    const css = `
      .${UI_CONFIG.CSS_CLASSES.SEARCH_CONTAINER} {
        position: relative;
      }
      .${UI_CONFIG.CSS_CLASSES.SEARCH_CONTAINER} input {
        width: 100%;
        box-sizing: border-box;
      }
      .${UI_CONFIG.CSS_CLASSES.SEARCH_RESULTS} {
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        background-color: var(--background-secondary);
        border: 1px solid var(--background-modifier-border);
        border-radius: var(--radius-m);
        z-index: 10;
        max-height: ${UI_CONFIG.MAX_DROPDOWN_HEIGHT}px;
        overflow-y: auto;
        min-width: 100%;
        box-sizing: border-box;
      }
      .${UI_CONFIG.CSS_CLASSES.SEARCH_ITEM} {
        padding: 8px 12px;
        cursor: pointer;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .${UI_CONFIG.CSS_CLASSES.SEARCH_ITEM_HOVER} {
        background-color: var(--background-modifier-hover);
      }
      .${UI_CONFIG.CSS_CLASSES.SEARCH_ITEM}.${UI_CONFIG.CSS_CLASSES.SEARCH_ITEM_SELECTED} {
        background-color: var(--background-modifier-success);
        color: var(--text-on-accent);
      }
    `;
    const styleEl = document.createElement('style');
    styleEl.id = 'enhanced-title-generator-styles';
    styleEl.innerHTML = css;
    document.head.appendChild(styleEl);
    this.register(() => styleEl.remove());
  }

  async loadSettings() {
    let loadedData = (await this.loadData()) || {};

    // Migration for a typo in a previous version
    if (loadedData.openaiModel && !loadedData.openAiModel) {
          if ((loadedData as any).debugMode) console.log('Migrating old setting `openaiModel` to `openAiModel`');
      loadedData.openAiModel = loadedData.openaiModel;
      delete loadedData.openaiModel;
    }

    this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  private async generateTitleForEditor(editor: Editor): Promise<void> {
    try {
      const activeFile = this.app.workspace.getActiveFile();
      if (!activeFile) {
        this.errorHandler.handleError(
          new Error('No active file found'),
          { context: 'generate-title-editor' }
        );
        return;
      }
      const content = editor.getValue();
      await this.processSingleFile(activeFile, content);
    } catch (error) {
      this.errorHandler.handleError(error as Error, { context: 'generate-title-editor' });
    }
  }

  private async generateTitleForFile(file: TFile): Promise<void> {
    try {
      const content = await this.app.vault.cachedRead(file);
      await this.processSingleFile(file, content);
    } catch (error) {
      this.errorHandler.handleError(error as Error, { context: 'generate-title-file', file: file.path });
    }
  }

  private async generateTitlesForMultipleFiles(files: TFile[]): Promise<void> {
    const total = files.length;
    const statusBarItem = this.addStatusBarItem();
    const progress: BatchOperationProgress = {
      total,
      processed: 0,
      succeeded: 0,
      failed: 0,
    };

    const updateStatus = () => {
      statusBarItem.setText(
        `Generating titles: ${progress.processed}/${total} (${progress.succeeded} succeeded, ${progress.failed} failed)`
      );
    };

    updateStatus();
    this.logger.info(`Starting batch title generation for ${total} files`);

    const errors: Error[] = [];

    for (const file of files) {
      progress.current = file.basename;
      try {
        await this.generateTitleForFile(file);
        progress.succeeded++;
        this.logger.debug(`Successfully generated title for ${file.path}`);
      } catch (error) {
        progress.failed++;
        errors.push(error as Error);
        this.logger.error(`Failed to generate title for ${file.path}`, error);
      } finally {
        progress.processed++;
        updateStatus();
      }
    }

    if (errors.length > 0) {
      this.errorHandler.handleMultipleErrors(errors, { context: 'batch-generation' });
    }

    statusBarItem.setText(`Title generation complete: ${progress.succeeded} succeeded, ${progress.failed} failed`);
    setTimeout(() => statusBarItem.remove(), UI_CONFIG.NOTIFICATION_DURATION.MEDIUM);
    
    this.logger.info(`Batch title generation completed`, progress);
  }

  private async processSingleFile(file: TFile, content: string): Promise<FileOperationResult> {
    if (!content.trim()) {
      const error = this.errorHandler.createGenerationError('Note is empty. Cannot generate title.');
      this.errorHandler.handleError(error);
      return { success: false, originalPath: file.path, error: error.message };
    }

    const statusBarItem = this.addStatusBarItem();
    statusBarItem.setText('Generating title...');

    try {
      // Validate content before processing
      const sanitizedContent = this.validationService.sanitizeInput(content);
      
      this.logger.debug(`Generating title for file: ${file.path}`);
      const newTitle = await this.aiService.generateTitle(sanitizedContent);

      if (newTitle) {
        // Sanitize the generated title
        const sanitizedTitle = this.validationService.sanitizeFilename(newTitle);
        
        const { dir, ext } = path.parse(file.path);
        let candidatePath = normalizePath(`${dir}/${sanitizedTitle}${ext}`);
        let counter = 1;
        
        while (this.app.vault.getAbstractFileByPath(candidatePath)) {
          candidatePath = normalizePath(`${dir}/${sanitizedTitle} (${counter})${ext}`);
          counter++;
        }

        if (candidatePath !== file.path) {
          await this.app.fileManager.renameFile(file, candidatePath);
          new Notice(`Title generated: "${sanitizedTitle}"`);
          this.logger.info(`File renamed: ${file.path} → ${candidatePath}`);
          return { success: true, originalPath: file.path, newPath: candidatePath };
        } else {
          new Notice(`Generated title is the same as the current one.`);
          this.logger.debug(`No rename needed for ${file.path}: title unchanged`);
          return { success: true, originalPath: file.path, newPath: file.path };
        }
      } else {
        const error = this.errorHandler.createGenerationError('Title generation returned empty result');
        this.errorHandler.handleError(error);
        return { success: false, originalPath: file.path, error: error.message };
      }
    } catch (error) {
      this.errorHandler.handleError(error as Error, { context: 'process-single-file', file: file.path });
      return { success: false, originalPath: file.path, error: (error as Error).message };
    } finally {
      statusBarItem.remove();
    }
  }
}
