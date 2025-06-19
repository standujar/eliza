import { handleError, UserEnvironment } from '@/src/utils';
import { Command } from 'commander';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import prompts from 'prompts';
import colors from 'yoctocolors';

/**
 * Get the path to the logger configuration file
 */
async function getLoggerConfigPath(): Promise<string> {
  const envInfo = await UserEnvironment.getInstanceInfo();
  return path.join(envInfo.paths.configPath, '..', 'logger.config.json');
}

/**
 * Default logger configuration based on current ElizaOS defaults
 */
const DEFAULT_LOGGER_CONFIG = {
  level: 'info',
  prettyPrint: true,
  jsonFormat: false,
  transport: 'console',
  transports: null,
  formatters: null,
  destination: null,
  redact: ['password', 'token', 'secret', 'key', 'apiKey'],
  customLevels: {
    fatal: 60,
    error: 50,
    warn: 40,
    info: 30,
    log: 29,
    progress: 28,
    success: 27,
    debug: 20,
    trace: 10,
  },
};

/**
 * Transport configurations templates
 */
const TRANSPORT_TEMPLATES = {
  console: {
    name: 'Console Output',
    description: 'Standard console output with pretty formatting',
    config: {
      transport: 'console',
      prettyPrint: true,
      transports: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'yyyy-mm-dd HH:MM:ss',
          ignore: 'pid,hostname',
        },
      },
    },
  },
  file: {
    name: 'File Logging',
    description: 'Log to a file with optional rotation',
    config: {
      transport: 'file',
      prettyPrint: false,
      transports: {
        target: 'pino/file',
        options: {
          destination: './logs/eliza.log',
        },
      },
    },
  },
  cloudwatch: {
    name: 'AWS CloudWatch',
    description: 'Log to AWS CloudWatch (requires pino-cloudwatch)',
    config: {
      transport: 'cloudwatch',
      jsonFormat: true,
      prettyPrint: false,
      transports: {
        target: 'pino-cloudwatch',
        options: {
          logGroupName: '/aws/eliza/agent',
          logStreamName: 'default',
          region: 'us-east-1',
        },
      },
    },
  },
  elasticsearch: {
    name: 'Elasticsearch',
    description: 'Log to Elasticsearch (requires pino-elasticsearch)',
    config: {
      transport: 'elasticsearch',
      jsonFormat: true,
      prettyPrint: false,
      transports: {
        target: 'pino-elasticsearch',
        options: {
          index: 'eliza-logs',
          node: 'http://localhost:9200',
        },
      },
    },
  },
  multi: {
    name: 'Multiple Transports',
    description: 'Log to console + file with different levels',
    config: {
      transport: 'multi',
      transports: {
        targets: [
          {
            target: 'pino-pretty',
            level: 'debug',
            options: {
              colorize: true,
              translateTime: 'yyyy-mm-dd HH:MM:ss',
              ignore: 'pid,hostname',
            },
          },
          {
            target: 'pino/file',
            level: 'info',
            options: {
              destination: './logs/eliza.log',
            },
          },
        ],
      },
    },
  },
};

/**
 * Load logger configuration from file
 */
async function loadLoggerConfig(): Promise<any> {
  try {
    const configPath = await getLoggerConfigPath();
    if (!existsSync(configPath)) {
      return DEFAULT_LOGGER_CONFIG;
    }
    const content = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.warn(`Failed to load logger config: ${error.message}`);
    return DEFAULT_LOGGER_CONFIG;
  }
}

/**
 * Save logger configuration to file
 */
async function saveLoggerConfig(config: any): Promise<void> {
  try {
    const configPath = await getLoggerConfigPath();
    const dir = path.dirname(configPath);
    
    if (!existsSync(dir)) {
      await fs.mkdir(dir, { recursive: true });
    }
    
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    console.info(colors.green(`✓ Logger configuration saved to ${configPath}`));
  } catch (error) {
    console.error(`Failed to save logger config: ${error.message}`);
  }
}

/**
 * Display current logger configuration
 */
async function showLoggerConfig(): Promise<void> {
  const config = await loadLoggerConfig();
  const configPath = await getLoggerConfigPath();
  
  console.info(colors.bold('\nLogger Configuration:'));
  console.info(`Path: ${colors.cyan(configPath)}`);
  console.info(`Transport: ${colors.green(config.transport || 'console')}`);
  console.info(`Level: ${colors.green(config.level || 'info')}`);
  console.info(`Pretty Print: ${config.prettyPrint ? colors.green('enabled') : colors.red('disabled')}`);
  console.info(`JSON Format: ${config.jsonFormat ? colors.green('enabled') : colors.red('disabled')}`);
  
  if (config.redact && config.redact.length > 0) {
    console.info(`Redacted Fields: ${colors.yellow(config.redact.join(', '))}`);
  }
  
  if (config.transports) {
    console.info('\nTransport Configuration:');
    console.info(colors.gray(JSON.stringify(config.transports, null, 2)));
  }
  
  console.info('\n' + colors.cyan('💡 Use `elizaos logger configure` to modify these settings'));
}

/**
 * Configure logger interactively
 */
async function configureLogger(): Promise<void> {
  const currentConfig = await loadLoggerConfig();
  
  console.info(colors.bold('\nLogger Configuration Setup\n'));
  
  // Step 1: Choose transport type
  const { transportType } = await prompts({
    type: 'select',
    name: 'transportType',
    message: 'Choose logging transport:',
    choices: Object.entries(TRANSPORT_TEMPLATES).map(([key, template]) => ({
      title: template.name,
      description: template.description,
      value: key,
    })),
    initial: Object.keys(TRANSPORT_TEMPLATES).indexOf(currentConfig.transport || 'console'),
  });

  let newConfig = {
    ...DEFAULT_LOGGER_CONFIG,
    ...TRANSPORT_TEMPLATES[transportType].config,
  };

  // Step 2: Configure log level
  const { level } = await prompts({
    type: 'select',
    name: 'level',
    message: 'Choose log level:',
    choices: [
      { title: 'trace', description: 'All logs (very verbose)', value: 'trace' },
      { title: 'debug', description: 'Debug information', value: 'debug' },
      { title: 'info', description: 'General information (recommended)', value: 'info' },
      { title: 'warn', description: 'Warnings only', value: 'warn' },
      { title: 'error', description: 'Errors only', value: 'error' },
      { title: 'fatal', description: 'Fatal errors only', value: 'fatal' },
    ],
    initial: ['trace', 'debug', 'info', 'warn', 'error', 'fatal'].indexOf(currentConfig.level || 'info'),
  });

  newConfig.level = level;

  // Step 3: Transport-specific configuration
  if (transportType === 'file') {
    const { filePath } = await prompts({
      type: 'text',
      name: 'filePath',
      message: 'Log file path:',
      initial: './logs/eliza.log',
    });
    
    newConfig.transports.options.destination = filePath;
  } else if (transportType === 'cloudwatch') {
    const { logGroupName, region } = await prompts([
      {
        type: 'text',
        name: 'logGroupName',
        message: 'CloudWatch Log Group Name:',
        initial: '/aws/eliza/agent',
      },
      {
        type: 'text',
        name: 'region',
        message: 'AWS Region:',
        initial: process.env.AWS_REGION || 'us-east-1',
      },
    ]);
    
    newConfig.transports.options.logGroupName = logGroupName;
    newConfig.transports.options.region = region;
    newConfig.transports.options.logStreamName = `instance-${Date.now()}`;
  } else if (transportType === 'elasticsearch') {
    const { elasticUrl, indexName } = await prompts([
      {
        type: 'text',
        name: 'elasticUrl',
        message: 'Elasticsearch URL:',
        initial: 'http://localhost:9200',
      },
      {
        type: 'text',
        name: 'indexName',
        message: 'Index name:',
        initial: 'eliza-logs',
      },
    ]);
    
    newConfig.transports.options.node = elasticUrl;
    newConfig.transports.options.index = indexName;
  } else if (transportType === 'multi') {
    const { fileLogLevel, filePath } = await prompts([
      {
        type: 'select',
        name: 'fileLogLevel',
        message: 'File log level (console will use debug):',
        choices: [
          { title: 'info', value: 'info' },
          { title: 'warn', value: 'warn' },
          { title: 'error', value: 'error' },
        ],
        initial: 0,
      },
      {
        type: 'text',
        name: 'filePath',
        message: 'Log file path:',
        initial: './logs/eliza.log',
      },
    ]);
    
    newConfig.transports.targets[1].level = fileLogLevel;
    newConfig.transports.targets[1].options.destination = filePath;
  }

  // Step 4: Additional options
  const { enableRedaction, customRedactFields } = await prompts([
    {
      type: 'confirm',
      name: 'enableRedaction',
      message: 'Enable automatic redaction of sensitive fields?',
      initial: true,
    },
    {
      type: prev => prev ? 'list' : null,
      name: 'customRedactFields',
      message: 'Custom fields to redact (comma-separated):',
      initial: 'password,token,secret,key,apiKey',
      separator: ',',
    },
  ]);

  if (enableRedaction) {
    newConfig.redact = customRedactFields || DEFAULT_LOGGER_CONFIG.redact;
  } else {
    newConfig.redact = [];
  }

  // Step 5: Show preview and confirm
  console.info(colors.bold('\nConfiguration Preview:'));
  console.info(colors.gray(JSON.stringify(newConfig, null, 2)));
  
  const { confirm } = await prompts({
    type: 'confirm',
    name: 'confirm',
    message: 'Save this configuration?',
    initial: true,
  });

  if (confirm) {
    await saveLoggerConfig(newConfig);
    console.info(colors.green('\n✓ Logger configuration updated!'));
    console.info(colors.yellow('📝 Restart your agent for changes to take effect.'));
    
    // Show required packages if needed
    const requiredPackages = getRequiredPackages(transportType);
    if (requiredPackages.length > 0) {
      console.info(colors.bold('\nRequired packages:'));
      console.info(colors.cyan(`npm install ${requiredPackages.join(' ')}`));
    }
  }
}

/**
 * Get required npm packages for a transport type
 */
function getRequiredPackages(transportType: string): string[] {
  switch (transportType) {
    case 'cloudwatch':
      return ['pino-cloudwatch'];
    case 'elasticsearch':
      return ['pino-elasticsearch'];
    case 'file':
      return []; // pino/file is built-in
    case 'multi':
      return []; // Uses built-in transports
    default:
      return [];
  }
}

/**
 * Reset logger configuration to defaults
 */
async function resetLoggerConfig(): Promise<void> {
  const { confirm } = await prompts({
    type: 'confirm',
    name: 'confirm',
    message: 'Reset logger configuration to defaults?',
    initial: false,
  });

  if (confirm) {
    await saveLoggerConfig(DEFAULT_LOGGER_CONFIG);
    console.info(colors.green('✓ Logger configuration reset to defaults'));
  }
}

/**
 * Generate logger configuration code
 */
async function generateCode(): Promise<void> {
  const config = await loadLoggerConfig();
  
  console.info(colors.bold('\nGenerated Code:'));
  console.info(colors.gray('// Add this to your project before importing @elizaos/core'));
  console.info('');
  console.info(colors.green("import { setLoggerConfig } from '@elizaos/core/logger-config';"));
  console.info('');
  console.info(colors.yellow('setLoggerConfig('));
  console.info(colors.cyan(JSON.stringify(config, null, 2)));
  console.info(colors.yellow(');'));
  console.info('');
  console.info(colors.gray('// Now import ElizaOS normally'));
  console.info(colors.green("import { logger, AgentRuntime } from '@elizaos/core';"));
}

/**
 * Main logger command menu
 */
async function showLoggerMenu(): Promise<void> {
  console.info(colors.bold('\nElizaOS Logger Configuration\n'));
  
  const { action } = await prompts({
    type: 'select',
    name: 'action',
    message: 'What would you like to do?',
    choices: [
      { title: 'Show current configuration', value: 'show' },
      { title: 'Configure logger', value: 'configure' },
      { title: 'Generate code', value: 'code' },
      { title: 'Reset to defaults', value: 'reset' },
      { title: 'Exit', value: 'exit' },
    ],
  });

  switch (action) {
    case 'show':
      await showLoggerConfig();
      break;
    case 'configure':
      await configureLogger();
      break;
    case 'code':
      await generateCode();
      break;
    case 'reset':
      await resetLoggerConfig();
      break;
    case 'exit':
      return;
  }
  
  // Show menu again unless exiting
  if (action !== 'exit') {
    await showLoggerMenu();
  }
}

// Create the logger command
export const logger = new Command()
  .name('logger')
  .description('Configure ElizaOS logger settings')
  .option('-s, --show', 'Show current logger configuration')
  .option('-c, --configure', 'Configure logger interactively')
  .option('-r, --reset', 'Reset logger configuration to defaults')
  .option('--level <level>', 'Set log level (trace, debug, info, warn, error, fatal)')
  .option('--transport <type>', 'Set transport type (console, file, cloudwatch, elasticsearch, multi)')
  .option('--file <path>', 'Set log file path (for file transport)')
  .option('--json', 'Enable JSON format output')
  .option('--no-pretty', 'Disable pretty printing')
  .action(async (options) => {
    try {
      // Handle command line options
      if (options.show) {
        await showLoggerConfig();
      } else if (options.configure) {
        await configureLogger();
      } else if (options.reset) {
        await resetLoggerConfig();
      } else if (options.level || options.transport || options.file || options.json || options.pretty === false) {
        // Direct configuration via CLI options
        const currentConfig = await loadLoggerConfig();
        const newConfig = { ...currentConfig };
        
        if (options.level) newConfig.level = options.level;
        if (options.transport) {
          const template = TRANSPORT_TEMPLATES[options.transport];
          if (template) {
            Object.assign(newConfig, template.config);
          }
        }
        if (options.file && newConfig.transports?.options) {
          newConfig.transports.options.destination = options.file;
        }
        if (options.json) newConfig.jsonFormat = true;
        if (options.pretty === false) newConfig.prettyPrint = false;
        
        await saveLoggerConfig(newConfig);
        console.info(colors.green('✓ Logger configuration updated'));
      } else {
        // No options provided, show interactive menu
        await showLoggerMenu();
      }
    } catch (error) {
      handleError(error);
    }
  }); 