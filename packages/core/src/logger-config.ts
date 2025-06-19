import pino, { type DestinationStream, type LogFn } from 'pino';

/**
 * Configuration interface for customizing the logger behavior
 * This allows downstream projects to customize the root logger before it's initialized
 */
export interface LoggerConfig {
  level?: string;
  customLevels?: Record<string, number>;
  transports?: pino.TransportSingleOptions | pino.TransportMultiOptions | pino.TransportPipelineOptions;
  formatters?: {
    level?: (label: string, number: number) => object;
    log?: (object: object) => object;
    bindings?: (bindings: pino.Bindings) => object;
  };
  serializers?: Record<string, pino.SerializerFn>;
  hooks?: {
    logMethod?: (inputArgs: [string | Record<string, unknown>, ...unknown[]], method: LogFn) => void;
  };
  prettyPrint?: boolean | object;
  jsonFormat?: boolean;
  destination?: DestinationStream;
  base?: object;
  timestamp?: boolean | (() => string);
  messageKey?: string;
  errorKey?: string;
  nestedKey?: string;
  mixin?: () => object;
  mixinMergeStrategy?: (mergeObject: object, mixinObject: object) => object;
  redact?: string[] | any;
  onChild?: (child: pino.Logger) => void;
  changeLevelName?: string;
  levelComparison?: 'ASC' | 'DESC' | ((current: number, expected: number) => boolean);
  useOnlyCustomLevels?: boolean;
  depthLimit?: number;
  edgeLimit?: number;
}

/**
 * Type for logger configuration function that can be provided by downstream projects
 */
export type LoggerConfigFunction = () => LoggerConfig | Promise<LoggerConfig>;

/**
 * Global configuration registry
 */
let globalLoggerConfig: LoggerConfig | null = null;
let configurationApplied = false;

/**
 * Set a global logger configuration that will be applied during logger initialization
 * This must be called BEFORE any logger usage or import of @elizaos/core
 * 
 * @param config - Logger configuration object or function that returns configuration
 * 
 * @example
 * ```typescript
 * import { setLoggerConfig } from '@elizaos/core/logger-config';
 * import pino from 'pino';
 * 
 * // CloudWatch example
 * setLoggerConfig({
 *   level: 'info',
 *   jsonFormat: true,
 *   transports: {
 *     target: 'pino-cloudwatch',
 *     options: {
 *       logGroupName: '/aws/lambda/my-agent',
 *       logStreamName: 'my-stream',
 *       region: 'us-east-1'
 *     }
 *   }
 * });
 * 
 * // Multiple transports example
 * setLoggerConfig({
 *   level: 'debug',
 *   transports: {
 *     targets: [
 *       {
 *         target: 'pino-pretty',
 *         level: 'debug',
 *         options: {
 *           colorize: true
 *         }
 *       },
 *       {
 *         target: 'pino/file',
 *         level: 'info',
 *         options: {
 *           destination: './logs/app.log'
 *         }
 *       }
 *     ]
 *   }
 * });
 * 
 * // Custom destination example
 * setLoggerConfig({
 *   destination: pino.destination('./custom.log')
 * });
 * ```
 */
export function setLoggerConfig(config: LoggerConfig): void {
  if (configurationApplied) {
    console.warn('Logger configuration has already been applied. Configuration changes may not take effect.');
  }
  globalLoggerConfig = config;
}

/**
 * Get the current logger configuration
 * Used internally by the logger initialization process
 */
export function getLoggerConfig(): LoggerConfig | null {
  configurationApplied = true;
  return globalLoggerConfig;
}

/**
 * Check if logger configuration has been set
 */
export function hasLoggerConfig(): boolean {
  return globalLoggerConfig !== null;
}

/**
 * Reset the logger configuration (primarily for testing)
 */
export function resetLoggerConfig(): void {
  globalLoggerConfig = null;
  configurationApplied = false;
}

/**
 * CloudWatch transport helper
 * Simplifies setting up CloudWatch logging
 */
export function createCloudWatchConfig(options: {
  logGroupName: string;
  logStreamName?: string;
  region?: string;
  level?: string;
}): LoggerConfig {
  return {
    level: options.level || 'info',
    jsonFormat: true,
    transports: {
      target: 'pino-cloudwatch',
      options: {
        logGroupName: options.logGroupName,
        logStreamName: options.logStreamName || 'default',
        region: options.region || process.env.AWS_REGION || 'us-east-1',
      },
    },
  };
}

/**
 * File logging helper
 * Simplifies setting up file-based logging
 */
export function createFileConfig(options: {
  filePath: string;
  level?: string;
  maxSize?: string;
  rotationTime?: string;
}): LoggerConfig {
  return {
    level: options.level || 'info',
    transports: {
      target: 'pino/file',
      options: {
        destination: options.filePath,
        maxSize: options.maxSize,
        rotationTime: options.rotationTime,
      },
    },
  };
}

/**
 * Multi-transport helper
 * Combines console and file logging with different levels
 */
export function createMultiTransportConfig(options: {
  consoleLevel?: string;
  fileLevel?: string;
  filePath?: string;
  prettyPrint?: boolean;
}): LoggerConfig {
  const targets: any[] = [];

  // Add console transport
  if (options.prettyPrint !== false) {
    targets.push({
      target: 'pino-pretty',
      level: options.consoleLevel || 'debug',
      options: {
        colorize: true,
        translateTime: 'yyyy-mm-dd HH:MM:ss',
        ignore: 'pid,hostname',
      },
    });
  }

  // Add file transport if path specified
  if (options.filePath) {
    targets.push({
      target: 'pino/file',
      level: options.fileLevel || 'info',
      options: {
        destination: options.filePath,
      },
    });
  }

  return {
    transports: {
      targets,
    },
  };
} 