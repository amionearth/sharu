$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root
Write-Host 'Preparing Indic Tiny TTS voices for English and Malayalam.' -ForegroundColor Cyan
python -c "import torch,numpy,safetensors,huggingface_hub; print('Python voice dependencies found.')"
if ($LASTEXITCODE -ne 0) { throw 'Install Python 3.10+, PyTorch, NumPy, Safetensors, and huggingface_hub first.' }
$models = @(
    @{ repo = 'sulabhkatiyar/indic-tiny-tts-malayalam'; folder = 'indic-tiny-tts-malayalam' },
    @{ repo = 'sulabhkatiyar/indic-tiny-tts-english'; folder = 'indic-tiny-tts-english' }
)
foreach ($item in $models) {
    $path = Join-Path $root "models\$($item.folder)"
    if (-not (Test-Path (Join-Path $path 'model.safetensors'))) {
        Write-Host "Downloading $($item.folder) (about 90 MB)…" -ForegroundColor Yellow
        python -c "from huggingface_hub import snapshot_download; snapshot_download(repo_id='$($item.repo)', local_dir=r'$path', allow_patterns=['config.json','model.safetensors','vocoder.safetensors','pyproject.toml','README.md','LICENSE.md','indic_tiny_tts/**'], ignore_patterns=['assets/**','samples/**','onnx/**'])"
        if ($LASTEXITCODE -ne 0) { throw "Could not download $($item.repo)." }
    }
}
Write-Host 'Both TTS voices are ready. Restart npm run dev.' -ForegroundColor Green
