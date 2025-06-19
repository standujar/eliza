#!/usr/bin/env bats

# -----------------------------------------------------------------------------
# logger command tests. These tests exercise the logger configuration
# functionality to check, update and reset logging settings.
# -----------------------------------------------------------------------------

setup() {
  set -euo pipefail

  export TEST_TMP_DIR="$(mktemp -d /var/tmp/eliza-test-logger-XXXXXX)"
  cd "$TEST_TMP_DIR"

  # Source common utilities
  source "$BATS_TEST_DIRNAME/common.sh"
  setup_elizaos_cmd
}

teardown() {
  [[ -n "${TEST_TMP_DIR:-}" ]] && rm -rf "$TEST_TMP_DIR"
}

# -----------------------------------------------------------------------------
# --help
# -----------------------------------------------------------------------------
@test "logger --help shows usage" {
  run $ELIZAOS_CMD logger --help
  [ "$status" -eq 0 ]
  [[ "$output" == *"Usage: elizaos logger"* ]]
  [[ "$output" == *"check"* ]]
  [[ "$output" == *"update"* ]]
  [[ "$output" == *"reset"* ]]
}

# -----------------------------------------------------------------------------
# logger check
# -----------------------------------------------------------------------------
@test "logger check shows current configuration" {
  run $ELIZAOS_CMD logger check
  [ "$status" -eq 0 ]
  [[ "$output" == *"Current Logging Configuration"* ]]
  [[ "$output" == *"Logger Level"* ]]
  [[ "$output" == *"Logger Format"* ]]
}

@test "logger check with character shows character-specific config" {
  # Create a basic character file
  mkdir -p characters
  cat > characters/test.character.json << 'EOF'
{
  "name": "Test Character",
  "plugins": [],
  "settings": {
    "logLevel": "debug"
  }
}
EOF

  run $ELIZAOS_CMD logger check --character characters/test.character.json
  [ "$status" -eq 0 ]
  [[ "$output" == *"Current Logging Configuration"* ]]
  [[ "$output" == *"Character file"* ]]
}

# -----------------------------------------------------------------------------
# logger update
# -----------------------------------------------------------------------------
@test "logger update changes log level" {
  run $ELIZAOS_CMD logger update --level debug
  [ "$status" -eq 0 ]
  [[ "$output" == *"Updated"* ]] || [[ "$output" == *"Set"* ]]
}

@test "logger update changes format" {
  run $ELIZAOS_CMD logger update --format json
  [ "$status" -eq 0 ]
  [[ "$output" == *"Updated"* ]] || [[ "$output" == *"Set"* ]]
}

@test "logger update with character updates character file" {
  # Create a basic character file
  mkdir -p characters
  cat > characters/test.character.json << 'EOF'
{
  "name": "Test Character",
  "plugins": [],
  "settings": {}
}
EOF

  run $ELIZAOS_CMD logger update --character characters/test.character.json --level warn
  [ "$status" -eq 0 ]
  [[ "$output" == *"Updated"* ]] || [[ "$output" == *"Set"* ]]
  
  # Verify the character file was updated
  run cat characters/test.character.json
  [[ "$output" == *"warn"* ]]
}

@test "logger update with invalid level shows error" {
  run $ELIZAOS_CMD logger update --level invalid
  [ "$status" -ne 0 ]
  [[ "$output" == *"Invalid"* ]] || [[ "$output" == *"error"* ]]
}

@test "logger update with invalid format shows error" {
  run $ELIZAOS_CMD logger update --format invalid
  [ "$status" -ne 0 ]
  [[ "$output" == *"Invalid"* ]] || [[ "$output" == *"error"* ]]
}

# -----------------------------------------------------------------------------
# logger reset
# -----------------------------------------------------------------------------
@test "logger reset restores default configuration" {
  # First set some non-default values
  $ELIZAOS_CMD logger update --level debug --format json
  
  # Then reset
  run $ELIZAOS_CMD logger reset --yes
  [ "$status" -eq 0 ]
  [[ "$output" == *"Reset"* ]] || [[ "$output" == *"restored"* ]]
}

@test "logger reset with character resets character file" {
  # Create a character file with custom log settings
  mkdir -p characters
  cat > characters/test.character.json << 'EOF'
{
  "name": "Test Character",
  "plugins": [],
  "settings": {
    "logLevel": "debug",
    "logFormat": "json"
  }
}
EOF

  run $ELIZAOS_CMD logger reset --character characters/test.character.json --yes
  [ "$status" -eq 0 ]
  [[ "$output" == *"Reset"* ]] || [[ "$output" == *"restored"* ]]
}

# -----------------------------------------------------------------------------
# Integration tests
# -----------------------------------------------------------------------------
@test "logger workflow: check -> update -> check -> reset" {
  # Initial check
  run $ELIZAOS_CMD logger check
  [ "$status" -eq 0 ]
  
  # Update settings
  run $ELIZAOS_CMD logger update --level warn --format json
  [ "$status" -eq 0 ]
  
  # Check updated settings
  run $ELIZAOS_CMD logger check
  [ "$status" -eq 0 ]
  [[ "$output" == *"warn"* ]]
  [[ "$output" == *"json"* ]]
  
  # Reset to defaults
  run $ELIZAOS_CMD logger reset --yes
  [ "$status" -eq 0 ]
  
  # Final check
  run $ELIZAOS_CMD logger check
  [ "$status" -eq 0 ]
} 