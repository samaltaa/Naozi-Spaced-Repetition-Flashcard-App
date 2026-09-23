#!/usr/bin/env bash
set -euf -o pipefail

# Branch policy for local merges

target="$(git rev-parse --abbrev-ref HEAD)"
message_file="$(git rev-parse --git-path MERGE_MSG)"
source_branch=""

if [ -f "$message_file" ]; then
  source_branch="$(sed -n "s/^Merge branch '\([^']*\)'.*/\1/p" "$message_file" | head -1)"
fi

if [ "$target" = "main" ]; then
  case "$source_branch" in
    dev|hotfix/*|"") ;;
    *)
      echo "Blocked: '$source_branch' cannot merge into main."
      echo "Only dev or hotfix/* may merge into main. Merge into dev instead."
      exit 1
      ;;
  esac
fi

if [ "$target" = "dev" ]; then
  case "$source_branch" in
    main)
      echo "Blocked: main should not be merged into dev this way."
      exit 1
      ;;
  esac
fi