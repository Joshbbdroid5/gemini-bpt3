#!/bin/bash
# Push to GitHub using the stored GITHUB_TOKEN secret
if [ -z "$GITHUB_TOKEN" ]; then
  echo "Error: GITHUB_TOKEN secret is not set"
  exit 1
fi
git push https://Joshbbdroid5:${GITHUB_TOKEN}@github.com/Joshbbdroid5/gemini-bpt3.git main
