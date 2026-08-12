param(
    [Parameter(Mandatory = $true)]
    [string]$SourcePath,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-z0-9-]+$')]
    [string]$Chapter,

    [string]$AltPrefix = 'Pregnancy journey memory',
    [string]$StorageAccount = 'shravekjourneyphotos',
    [string]$Container = 'photos'
)

$ErrorActionPreference = 'Stop'
$imageExtensions = @('.heic', '.jpg', '.jpeg', '.png', '.webp')
$videoExtensions = @('.mov', '.mp4')
$manifestPath = Join-Path $PSScriptRoot 'js\pregnancy-media.js'
$outputPath = Join-Path $env:TEMP "shravek-pregnancy-media\$Chapter"
$blobPrefix = "pregnancy-journey/$Chapter"
$blobRoot = "https://$StorageAccount.blob.core.windows.net/$Container/$blobPrefix"

function Get-NaturalSortKey([string]$Name) {
    return [regex]::Replace($Name.ToLowerInvariant(), '\d+', {
        param($match)
        $match.Value.PadLeft(20, '0')
    })
}

function Get-SafeStem([string]$Name) {
    $stem = [System.IO.Path]::GetFileNameWithoutExtension($Name).ToLowerInvariant()
    $stem = $stem -replace '[^a-z0-9]+', '-'
    return $stem.Trim('-')
}

if (-not (Test-Path -LiteralPath $SourcePath -PathType Container)) {
    throw "Source folder not found: $SourcePath"
}

$magick = (Get-Command magick -ErrorAction Stop).Source
$ffmpegCommand = Get-Command ffmpeg -ErrorAction SilentlyContinue
$ffmpeg = if ($ffmpegCommand) {
    $ffmpegCommand.Source
} else {
    Get-ChildItem -LiteralPath "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Filter ffmpeg.exe -Recurse -File |
        Select-Object -First 1 -ExpandProperty FullName
}
if (-not $ffmpeg) {
    throw 'FFmpeg is required to process videos.'
}

New-Item -ItemType Directory -Path $outputPath -Force | Out-Null
Get-ChildItem -LiteralPath $outputPath -File | Remove-Item -Force

$sourceFiles = Get-ChildItem -LiteralPath $SourcePath -File |
    Where-Object { $_.Extension.ToLowerInvariant() -in ($imageExtensions + $videoExtensions) } |
    Sort-Object @{ Expression = { Get-NaturalSortKey $_.Name } }, @{ Expression = { $_.Name } }

$assets = [System.Collections.Generic.List[object]]::new()
$sequence = 0

foreach ($source in $sourceFiles) {
    $sequence++
    $sequencePrefix = '{0:d3}' -f $sequence
    $safeStem = Get-SafeStem $source.Name
    $extension = $source.Extension.ToLowerInvariant()

    if ($extension -in $imageExtensions) {
        $blobName = "$sequencePrefix-$safeStem.webp"
        $destination = Join-Path $outputPath $blobName
        & $magick $source.FullName -auto-orient -strip -resize '1600x1600>' -quality 76 -define webp:method=6 $destination
        if ($LASTEXITCODE -ne 0) { throw "Image conversion failed: $($source.FullName)" }

        $assets.Add([ordered]@{
            order = $sequence
            sourceName = $source.Name
            type = 'image'
            url = "$blobRoot/$blobName"
            alt = "$AltPrefix $sequence"
        })
        continue
    }

    $videoName = "$sequencePrefix-$safeStem.mp4"
    $posterName = "$sequencePrefix-$safeStem-poster.webp"
    $videoDestination = Join-Path $outputPath $videoName
    $posterDestination = Join-Path $outputPath $posterName

    & $ffmpeg -hide_banner -loglevel error -y -i $source.FullName -map_metadata -1 -vf "scale='min(1280,iw)':-2:force_original_aspect_ratio=decrease" -c:v libx264 -preset medium -crf 27 -c:a aac -b:a 128k -movflags +faststart -pix_fmt yuv420p $videoDestination
    if ($LASTEXITCODE -ne 0) { throw "Video conversion failed: $($source.FullName)" }
    & $ffmpeg -hide_banner -loglevel error -y -ss 0.5 -i $videoDestination -frames:v 1 -vf "scale='min(900,iw)':-2:force_original_aspect_ratio=decrease" $posterDestination
    if ($LASTEXITCODE -ne 0) { throw "Video poster creation failed: $($source.FullName)" }

    $assets.Add([ordered]@{
        order = $sequence
        sourceName = $source.Name
        type = 'video'
        url = "$blobRoot/$videoName"
        poster = "$blobRoot/$posterName"
        alt = "$AltPrefix $sequence"
    })
}

$storageKey = az storage account keys list --account-name $StorageAccount --query '[0].value' -o tsv
if (-not $storageKey) {
    throw "Unable to retrieve the storage key for $StorageAccount."
}

az storage blob upload-batch `
    --account-name $StorageAccount `
    --account-key $storageKey `
    --destination $Container `
    --destination-path $blobPrefix `
    --source $outputPath `
    --overwrite true `
    --content-cache-control 'public, max-age=31536000, immutable' `
    --only-show-errors `
    -o none
if ($LASTEXITCODE -ne 0) { throw "Azure upload failed for chapter $Chapter." }

$manifestText = [System.IO.File]::ReadAllText($manifestPath)
$manifestJson = $manifestText -replace '^window\.PREGNANCY_MEDIA=', '' -replace ';\s*$', ''
$manifest = $manifestJson | ConvertFrom-Json -AsHashtable

if ($Chapter -eq 'welcome-home' -and $manifest['arrival'].Count -gt 33) {
    $manifest['arrival'] = @($manifest['arrival'] | Select-Object -First 33)
}
$manifest[$Chapter] = $assets

$updatedJson = $manifest | ConvertTo-Json -Depth 8 -Compress
[System.IO.File]::WriteAllText(
    $manifestPath,
    "window.PREGNANCY_MEDIA=$updatedJson;`n",
    [System.Text.UTF8Encoding]::new($false)
)

Write-Output "Uploaded $sequence assets to $blobPrefix in natural filename order."
Write-Output "Updated $manifestPath with order and sourceName metadata."
