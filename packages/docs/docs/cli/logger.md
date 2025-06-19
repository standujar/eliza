---
sidebar_position: 7
title: Logger Configuration
description: Configure ElizaOS logger settings via CLI with support for multiple transports, levels, and formats
keywords: [logger, logging, CLI, configuration, CloudWatch, Elasticsearch, file logging, debug]
image: /img/cli.jpg
---

# Logger Configuration

The `elizaos logger` command provides a comprehensive interface for configuring the ElizaOS logging system without writing code. It supports multiple transports, interactive configuration, and persistent settings.

## Overview

The logger command offers:

- **Interactive configuration** with guided setup
- **Command-line options** for automation
- **Pre-configured templates** for different transports
- **Persistent configuration** saved automatically
- **Default values** aligned with current ElizaOS settings

## Basic Usage

### Interactive Menu

```bash
# Launch interactive configuration menu
elizaos logger
```

### Quick Commands

```bash
# Show current configuration
elizaos logger --show

# Interactive guided setup
elizaos logger --configure

# Reset to defaults
elizaos logger --reset
```

### Direct Configuration

```bash
# Set log level
elizaos logger --level debug

# Configure file transport
elizaos logger --transport file --file ./logs/my-agent.log

# Enable JSON format
elizaos logger --json --level info

# CloudWatch setup
elizaos logger --transport cloudwatch --level info --json
```

## Transport Templates

### 1. Console (Default)

Standard console output with colorized formatting.

```bash
elizaos logger --transport console --level info
```

**Generated configuration:**
```json
{
  "transport": "console",
  "level": "info",
  "prettyPrint": true,
  "transports": {
    "target": "pino-pretty",
    "options": {
      "colorize": true,
      "translateTime": "yyyy-mm-dd HH:MM:ss",
      "ignore": "pid,hostname"
    }
  }
}
```

### 2. File Logging

Log to files with optional rotation.

```bash
elizaos logger --transport file --file ./logs/eliza.log --level info
```

**Generated configuration:**
```json
{
  "transport": "file",
  "level": "info",
  "prettyPrint": false,
  "transports": {
    "target": "pino/file",
    "options": {
      "destination": "./logs/eliza.log"
    }
  }
}
```

### 3. AWS CloudWatch

Full AWS CloudWatch Logs integration.

```bash
elizaos logger --transport cloudwatch --level info --json
```

**Required package:**
```bash
npm install pino-cloudwatch
```

**Interactive configuration prompts:**
- **Log Group Name**: `/aws/eliza/agent`
- **AWS Region**: `us-east-1` (or from `AWS_REGION`)

### 4. Elasticsearch

Log indexing for advanced search and analysis.

```bash
elizaos logger --transport elasticsearch --level info --json
```

**Required package:**
```bash
npm install pino-elasticsearch
```

**Interactive configuration:**
- **Elasticsearch URL**: `http://localhost:9200`
- **Index name**: `eliza-logs`

### 5. Multi-Transport

Console + file simultaneously with different levels.

```bash
elizaos logger --transport multi
```

**Default configuration:**
- **Console**: `debug` level with pretty printing
- **File**: `info` level to `./logs/eliza.log`

## Integration with Start Command

The `start` command now supports direct logger options:

```bash
# Start with debug logging to file
elizaos start --log-level debug --log-transport file --log-file ./logs/agent.log

# Start with JSON format for CloudWatch
elizaos start --log-json --log-transport cloudwatch --log-level info

# Disable pretty printing for production
elizaos start --no-log-pretty --log-level warn
```

## Interactive Configuration Flow

### Main Menu

```bash
elizaos logger
```

Displays:
```
ElizaOS Logger Configuration

? What would you like to do?
❯ Show current configuration
  Configure logger
  Generate code
  Reset to defaults
  Exit
```

### Configuration Wizard

```bash
elizaos logger configure
```

Step-by-step guidance:

1. **Transport Selection**
   ```
   ? Choose logging transport:
   ❯ Console Output - Standard console output with pretty formatting
     File Logging - Log to a file with optional rotation
     AWS CloudWatch - Log to AWS CloudWatch (requires pino-cloudwatch)
     Elasticsearch - Log to Elasticsearch (requires pino-elasticsearch)
     Multiple Transports - Log to console + file with different levels
   ```

2. **Log Level**
   ```
   ? Choose log level:
   ❯ info - General information (recommended)
     debug - Debug information
     warn - Warnings only
     error - Errors only
     trace - All logs (very verbose)
     fatal - Fatal errors only
   ```

3. **Transport-specific settings**
4. **Security options (field redaction)**
5. **Preview and confirmation**

## Configuration File

Settings are persisted in:
```
~/.elizaos/logger.config.json
```

### Default Structure

```json
{
  "level": "info",
  "prettyPrint": true,
  "jsonFormat": false,
  "transport": "console",
  "transports": {
    "target": "pino-pretty",
    "options": {
      "colorize": true,
      "translateTime": "yyyy-mm-dd HH:MM:ss",
      "ignore": "pid,hostname"
    }
  },
  "redact": ["password", "token", "secret", "key", "apiKey"],
  "customLevels": {
    "fatal": 60,
    "error": 50,
    "warn": 40,
    "info": 30,
    "log": 29,
    "progress": 28,
    "success": 27,
    "debug": 20,
    "trace": 10
  }
}
```

## Code Generation

Generate TypeScript code for manual integration:

```bash
elizaos logger code
```

**Output:**
```typescript
// Add this to your project before importing @elizaos/core
import { setLoggerConfig } from '@elizaos/core/logger-config';

setLoggerConfig({
  "level": "info",
  "transport": "file",
  "transports": {
    "target": "pino/file",
    "options": {
      "destination": "./logs/eliza.log"
    }
  }
});

// Now import ElizaOS normally
import { logger, AgentRuntime } from '@elizaos/core';
```

## Advanced Examples

### Production CloudWatch Setup

```bash
# Complete production configuration
elizaos logger configure
# → Select CloudWatch
# → Log Group: /aws/eliza/production
# → Region: us-east-1
# → Level: warn
# → Enable redaction

# Start agent
elizaos start --port 3000
```

### Development with Multi-Transport

```bash
# Setup for development
elizaos logger --transport multi --level debug

# Start with custom character
elizaos start --character ./my-character.json --log-level trace
```

### Elasticsearch Monitoring

```bash
# Configure for monitoring
elizaos logger --transport elasticsearch --level info --json

# Environment variables for Elasticsearch
export ELASTICSEARCH_URL=http://elk.internal:9200
export LOG_INDEX=eliza-production

elizaos start
```

## Command Options

| Option | Description |
|--------|------------|
| `--show`, `-s` | Show current logger configuration |
| `--configure`, `-c` | Launch interactive configuration wizard |
| `--reset`, `-r` | Reset configuration to defaults |
| `--level <level>` | Set log level (trace, debug, info, warn, error, fatal) |
| `--transport <type>` | Set transport type (console, file, cloudwatch, elasticsearch, multi) |
| `--file <path>` | Set log file path (for file transport) |
| `--json` | Enable JSON format output |
| `--no-pretty` | Disable pretty printing |

## Troubleshooting

### Check Current Configuration

```bash
# Display current settings
elizaos logger --show

# Verify configuration file path
elizaos logger --show | grep "Path:"
```

### Reset Configuration

```bash
# Reset via command
elizaos logger --reset

# Or delete configuration file
rm ~/.elizaos/logger.config.json
```

### Missing Dependencies

Install required packages for specialized transports:

```bash
# CloudWatch
npm install pino-cloudwatch

# Elasticsearch
npm install pino-elasticsearch

# HTTP transport
npm install pino-http-send
```

## Best Practices

| Environment | Recommended Setup |
|-------------|------------------|
| **Development** | Multi-transport: console (debug) + file (info) |
| **Production** | CloudWatch or Elasticsearch with warn+ level |
| **Containers** | JSON format enabled for log aggregation |
| **CI/CD** | Use CLI options for automated configuration |
| **Security** | Always enable redaction for sensitive fields |

## Related Commands

- [`start`](./start.md) - Start agents with logger options
- [`dev`](./dev.md) - Development mode with enhanced logging  
- [`env`](./env.md) - Environment variable management

---

The logger command provides a simplified approach to configuring ElizaOS logging while maintaining full flexibility for advanced use cases. 