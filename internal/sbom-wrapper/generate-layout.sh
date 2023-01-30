#!/bin/bash
set -euo pipefail

#find sboms/ -maxdepth 2 -regex 'sboms/sbom-action-.*/*.json' > FILES
sudo find /tmp/ -maxdepth 2 -regex '/tmp/sbom-action-.*/*.json' | tee ./FILES

attestations=()
n=$(wc -l <./FILES)
i=1
while IFS= read -r line; do
    file="$line"

    echo "SBOM file: $file"
    hash=$(sha256sum "$file" | awk '{print $1}')
    subject_name=$(basename "$(readlink -m "$file")")
    read -r -d '' entry <<- EOM
    {
        "name": "$subject_name",
        "digest":
        { 
            "sha256": "$hash"
        }
    }
EOM
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