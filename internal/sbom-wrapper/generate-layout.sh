#!/bin/bash
set -euo pipefail

find sboms/ -maxdepth 2 -regex 'sboms/sbom-action-.*/*.json' > FILES
# NOTE: the name / extension varies dependecin on user input.
# Here's I'm assuming it's .sbom.
#sudo find /tmp/ -maxdepth 2 -regex '/tmp/sbom-action-.*/*.sbom' | tee ./FILES

attestations=()
n=$(wc -l <./FILES)
i=1
while IFS= read -r line; do
    file="$line"

    echo "SBOM file: $file"
    hash=$(sha256sum "$file" | awk '{print $1}')
    subject_name=$(basename "$(readlink -m "$file")")
    template='{"name": "%s", "digest": {"sha256": "%s"}}'
    printf -v entry "$template" "$subject_name" "$hash"

    if [[ $i -eq $n ]]; then
        attestations+=("$entry")
    else
        attestations+=("$entry,")
    fi

    i=$((i+1))
done < FILES

cat <<EOF >DATA
{
    "version": 1,
    "attestations":
    [
        {
            "name": "attestation.intoto",
            "subjects":
            [
                ${attestations[@]}
            ]
        }
    ]
}
EOF

jq <DATA

# Expected file with pre-defined output
cat DATA > "$SLSA_OUTPUTS_ARTIFACTS_FILE"
