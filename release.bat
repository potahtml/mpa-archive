call npm version patch --git-tag-version false

call git add --all
call git commit -m "update"

call git push --all --prune

call npm publish