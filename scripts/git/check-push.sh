#!/usr/bin/env bash
set -euo pipefail

#branch policy for pushes 

branch="$(git rev-parse --abbrev-ref HEAD)"

case "$branch" in
  main|dev)
    echo "Blocked: direct pushes to '$branch' are not allowed."
    echo "Create a branch and open a pull request instead:"
    echo "  git switch -c feat/your-change"
    exit 1
    ;;
esac

pattern='^(feat|fix|chore|docs|refactor|test|perf|ci|build|hotfix)/[a-z0-9][a-z0-9._-]*$'

if ! printf '%s' "$branch" | grep -Eq "$pattern"; then
  echo "Blocked: '$branch' is not a valid branch name."
  echo "Use one of: feat/ fix/ chore/ docs/ refactor/ test/ perf/ ci/ build/ hotfix/"
  echo "Example: fix/session-back-navigation"
  exit 1
fi