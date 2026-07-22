#!/bin/bash
# Bloquea Edit/Write sobre archivos .env* — los secretos se editan a mano, nunca desde Claude.
# (.env.example está permitido: es la plantilla sin valores.)
input=$(cat)
file_path=$(echo "$input" | sed -n 's/.*"file_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)
base=$(basename "$file_path")
case "$base" in
  .env.example) exit 0 ;;
  .env*)
    echo "Los archivos .env no se editan desde Claude — hazlo manualmente (y recarga el archivo en el IDE antes de guardar)." >&2
    exit 2 ;;
esac
exit 0
