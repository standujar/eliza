---
sidebar_position: 12
title: Advanced Logger Configuration
description: Advanced programmatic logger configuration for ElizaOS with custom transports, formatters, and integrations
keywords: [logger, logging, configuration, pino, CloudWatch, Elasticsearch, transports, formatters]
---

# Advanced Logger Configuration

This guide covers advanced programmatic logger configuration for ElizaOS agents. For simpler setup, see the [CLI Logger Configuration](../cli/logger.md).

## Overview

The ElizaOS logger configuration system allows you to customize the root logger behavior before it's initialized. This enables full control over transports, formatters, and other pino logger options.

### Configuration Approaches

1. **CLI Configuration** (Recommended) - Use `elizaos logger` command ([see guide](../cli/logger.md))
2. **Programmatic Configuration** (This guide) - Full control via code

## Basic Setup

### File Logging

```typescript
// src/index.ts - MUST be called before any ElizaOS imports
import { setLoggerConfig } from '@elizaos/core/logger-config';

setLoggerConfig({
  level: 'info',
  transports: {
    target: 'pino/file',
    options: {
      destination: './logs/my-agent.log'
    }
  }
});

// Now import and use ElizaOS normally
import { AgentRuntime, logger } from '@elizaos/core';

logger.info('This will be logged to file!');
```

### CloudWatch Integration

```typescript
import { setLoggerConfig, createCloudWatchConfig } from '@elizaos/core/logger-config';

// Simple CloudWatch setup
setLoggerConfig(createCloudWatchConfig({
  logGroupName: '/aws/lambda/my-eliza-agent',
  logStreamName: `instance-${Date.now()}`,
  region: 'us-east-1',
  level: 'info'
}));

// Or manual configuration
setLoggerConfig({
  level: 'info',
  jsonFormat: true, // Required for CloudWatch
  transports: {
    target: 'pino-cloudwatch',
    options: {
      logGroupName: '/aws/lambda/my-eliza-agent',
      logStreamName: 'my-stream',
      region: 'us-east-1',
      createLogGroup: true,
      createLogStream: true,
      intervalMs: 1000,
      batchSize: 100
    }
  }
});
```

**Required package:**
```bash
npm install pino-cloudwatch
```

### Multiple Transports

```typescript
import { setLoggerConfig, createMultiTransportConfig } from '@elizaos/core/logger-config';

// Helper function for common setup
setLoggerConfig(createMultiTransportConfig({
  consoleLevel: 'debug',
  fileLevel: 'info',
  filePath: './logs/app.log',
  prettyPrint: true
}));

// Or manual configuration
setLoggerConfig({
  level: 'debug',
  transports: {
    targets: [
      {
        target: 'pino-pretty',
        level: 'debug',
        options: {
          colorize: true,
          translateTime: 'yyyy-mm-dd HH:MM:ss',
          ignore: 'pid,hostname'
        }
      },
      {
        target: 'pino/file',
        level: 'info',
        options: {
          destination: './logs/app.log'
        }
      },
      {
        target: 'pino-elasticsearch',
        level: 'warn',
        options: {
          index: 'eliza-logs',
          consistency: 'one',
          node: 'http://localhost:9200',
          'bulk-size': 200,
          'bulk-bytes': 1000000
        }
      }
    ]
  }
});
```

## Advanced Configuration

### Custom Formatters and Serializers

```typescript
setLoggerConfig({
  level: 'info',
  formatters: {
    level: (label: string, number: number) => ({
      severity: label.toUpperCase(),
      level: number
    }),
    log: (object: any) => ({
      ...object,
      timestamp: new Date().toISOString(),
      service: 'eliza-agent',
      version: process.env.npm_package_version
    })
  },
  serializers: {
    user: (user: any) => ({
      id: user.id,
      username: user.username
      // Don't log sensitive data like passwords
    }),
    error: (err: Error) => ({
      type: err.constructor.name,
      message: err.message,
      stack: err.stack?.split('\n')
    })
  },
  transports: {
    target: 'pino-pretty'
  }
});
```

### HTTP Transport for External Services

```typescript
setLoggerConfig({
  level: 'info',
  transports: {
    target: 'pino-http-send',
    options: {
      url: 'https://logs.example.com/api/logs',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.LOG_API_TOKEN}`,
        'Content-Type': 'application/json'
      },
      batchSize: 10,
      timeout: 5000
    }
  }
});
```

**Required package:**
```bash
npm install pino-http-send
```

### Structured JSON Logging for Kubernetes

```typescript
setLoggerConfig({
  level: process.env.LOG_LEVEL || 'info',
  jsonFormat: true,
  formatters: {
    log: (object: any) => ({
      ...object,
      '@timestamp': new Date().toISOString(),
      service: {
        name: 'eliza-agent',
        version: process.env.SERVICE_VERSION,
        environment: process.env.NODE_ENV
      },
      kubernetes: {
        pod: process.env.HOSTNAME,
        namespace: process.env.NAMESPACE
      }
    })
  },
  redact: ['password', 'token', 'secret', 'key'],
  destination: process.stdout
});
```

## Complete Project Example

### Production Agent with CloudWatch

```typescript
// src/index.ts
import { setLoggerConfig } from '@elizaos/core/logger-config';
import { AgentRuntime, logger } from '@elizaos/core';

// Configure logger first
setLoggerConfig({
  level: process.env.LOG_LEVEL || 'info',
  jsonFormat: true,
  transports: {
    target: 'pino-cloudwatch',
    options: {
      logGroupName: '/aws/eliza/production',
      logStreamName: `instance-${process.env.HOSTNAME || Date.now()}`,
      region: process.env.AWS_REGION || 'us-east-1',
      createLogGroup: true,
      createLogStream: true
    }
  },
  redact: ['password', 'apiKey', 'token', 'secret']
});

// Now use ElizaOS normally
const runtime = new AgentRuntime({
  // ... your agent config
});

logger.info('Agent starting', { 
  environment: process.env.NODE_ENV,
  version: process.env.npm_package_version 
});
```

### Development Agent with Multi-Transport

```typescript
// src/index.ts
import { setLoggerConfig } from '@elizaos/core/logger-config';

setLoggerConfig({
  level: 'debug',
  transports: {
    targets: [
      // Console for development
      {
        target: 'pino-pretty',
        level: 'debug',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
          messageFormat: '{msg}',
          translateTime: 'yyyy-mm-dd HH:MM:ss'
        }
      },
      // File for persistence
      {
        target: 'pino/file',
        level: 'info',
        options: {
          destination: './logs/development.log'
        }
      }
    ]
  }
});

import { AgentRuntime, logger } from '@elizaos/core';
// Continue with agent setup...
```

## Environment-Based Configuration

```typescript
// src/logger-config.ts
import { setLoggerConfig } from '@elizaos/core/logger-config';

const configureLogger = () => {
  const env = process.env.NODE_ENV || 'development';
  
  switch (env) {
    case 'production':
      setLoggerConfig({
        level: 'warn',
        jsonFormat: true,
        transports: {
          target: 'pino-cloudwatch',
          options: {
            logGroupName: '/aws/eliza/production',
            region: process.env.AWS_REGION,
            logStreamName: process.env.HOSTNAME
          }
        }
      });
      break;
      
    case 'staging':
      setLoggerConfig({
        level: 'info',
        jsonFormat: true,
        transports: {
          targets: [
            {
              target: 'pino-pretty',
              level: 'info'
            },
            {
              target: 'pino-elasticsearch',
              level: 'info',
              options: {
                node: process.env.ELASTICSEARCH_URL,
                index: 'eliza-staging'
              }
            }
          ]
        }
      });
      break;
      
    default: // development
      setLoggerConfig({
        level: 'debug',
        transports: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss'
          }
        }
      });
  }
};

configureLogger();
```

## Transport-Specific Configurations

### Elasticsearch Configuration

```typescript
setLoggerConfig({
  level: 'info',
  jsonFormat: true,
  transports: {
    target: 'pino-elasticsearch',
    options: {
      index: 'eliza-logs',
      node: 'http://localhost:9200',
      'bulk-size': 200,
      'bulk-bytes': 1000000,
      consistency: 'one',
      'es-version': 7,
      'flush-bytes': 1000
    }
  }
});
```

**Required package:**
```bash
npm install pino-elasticsearch
```

### File Rotation Configuration

```typescript
setLoggerConfig({
  level: 'info',
  transports: {
    target: 'pino-roll',
    options: {
      file: './logs/app.log',
      frequency: 'daily',
      size: '10m',
      limit: {
        count: 5
      }
    }
  }
});
```

**Required package:**
```bash
npm install pino-roll
```

## Helper Functions

The logger configuration system provides helper functions for common setups:

### CloudWatch Helper

```typescript
import { createCloudWatchConfig } from '@elizaos/core/logger-config';

const config = createCloudWatchConfig({
  logGroupName: '/aws/eliza/my-agent',
  region: 'us-east-1',
  level: 'info'
});

setLoggerConfig(config);
```

### File Helper

```typescript
import { createFileConfig } from '@elizaos/core/logger-config';

const config = createFileConfig({
  filePath: './logs/agent.log',
  level: 'info',
  rotate: true
});

setLoggerConfig(config);
```

### Multi-Transport Helper

```typescript
import { createMultiTransportConfig } from '@elizaos/core/logger-config';

const config = createMultiTransportConfig({
  consoleLevel: 'debug',
  fileLevel: 'info',
  filePath: './logs/app.log',
  prettyPrint: true
});

setLoggerConfig(config);
```

## Best Practices

### Security

- Always redact sensitive fields:
  ```typescript
  setLoggerConfig({
    redact: ['password', 'token', 'apiKey', 'secret', 'privateKey']
  });
  ```

### Performance

- Use appropriate log levels for each environment
- Consider async logging for high-volume applications:
  ```typescript
  setLoggerConfig({
    transports: {
      target: 'pino/file',
      options: {
        destination: './logs/app.log',
        sync: false // Async writing
      }
    }
  });
  ```

### Monitoring

- Include correlation IDs:
  ```typescript
  setLoggerConfig({
    formatters: {
      log: (object) => ({
        ...object,
        correlationId: object.correlationId || generateId(),
        timestamp: new Date().toISOString()
      })
    }
  });
  ```

## Troubleshooting

### Configuration Not Applied

Ensure `setLoggerConfig()` is called **before** any ElizaOS imports:

```typescript
// ✅ Correct order
import { setLoggerConfig } from '@elizaos/core/logger-config';
setLoggerConfig({ /* config */ });
import { logger, AgentRuntime } from '@elizaos/core';

// ❌ Wrong order
import { logger, AgentRuntime } from '@elizaos/core';
import { setLoggerConfig } from '@elizaos/core/logger-config';
setLoggerConfig({ /* config */ }); // Too late!
```

### Transport Dependencies

Make sure required packages are installed:

```bash
# CloudWatch
npm install pino-cloudwatch

# Elasticsearch  
npm install pino-elasticsearch

# HTTP transport
npm install pino-http-send

# File rotation
npm install pino-roll
```

### Testing Configuration

Test your logger configuration:

```typescript
import { setLoggerConfig } from '@elizaos/core/logger-config';

setLoggerConfig({
  level: 'debug',
  transports: {
    target: 'pino-pretty'
  }
});

import { logger } from '@elizaos/core';

// Test all levels
logger.trace('Trace message');
logger.debug('Debug message');
logger.info('Info message');
logger.warn('Warning message');
logger.error('Error message');
logger.fatal('Fatal message');
```

## Related Documentation

- [CLI Logger Configuration](../cli/logger.md) - Interactive setup
- [Services](./services.md) - Service-specific logging
- [Agents](./agents.md) - Agent runtime logging

---

For simpler configuration needs, consider using the [CLI Logger tool](../cli/logger.md) which provides an interactive interface for common logging scenarios. 