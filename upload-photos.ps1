# Upload photos to Azure Blob Storage and auto-categorize with AI
# Usage: .\upload-photos.ps1 -Path "C:\path\to\photos"

param(
    [Parameter(Mandatory=$true)]
    [string]$Path,
    [string]$SiteUrl = "https://wonderful-sky-0deef0e10.7.azurestaticapps.net"
)

$env:Path += ";C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin"
$storageAccount = "shravekjourneyphotos"
$container = "photos"

if (-not (Test-Path $Path)) {
    Write-Error "Folder not found: $Path"
    exit 1
}

$photos = Get-ChildItem $Path -Recurse -File -Include *.jpg, *.jpeg, *.png, *.webp, *.gif
if ($photos.Count -eq 0) {
    Write-Warning "No image files found in $Path"
    exit 0
}

Write-Host "Found $($photos.Count) photos to upload" -ForegroundColor Cyan
Write-Host ""

$storageKey = az storage account keys list --account-name $storageAccount --query "[0].value" -o tsv

$results = @()
$i = 0

foreach ($photo in $photos) {
    $i++
    $percent = [math]::Round(($i / $photos.Count) * 100)
    
    # Use subfolder as blob prefix
    $relativePath = $photo.FullName.Replace($Path, "").TrimStart("\").Replace("\", "/")
    $blobName = $relativePath
    
    Write-Host "[$percent%] Uploading: $blobName" -ForegroundColor Yellow
    
    # Upload to blob storage
    az storage blob upload --account-name $storageAccount --account-key $storageKey --container-name $container --name $blobName --file $photo.FullName --overwrite -o none 2>$null
    
    $blobUrl = "https://$storageAccount.blob.core.windows.net/$container/$blobName"
    
    # Call AI analysis endpoint
    Write-Host "  Analyzing with AI..." -ForegroundColor DarkGray
    try {
        $body = @{ url = $blobUrl; caption = $photo.BaseName -replace "[_-]", " " } | ConvertTo-Json
        $response = Invoke-WebRequest -Uri "$SiteUrl/api/journey/analyze-photo" -Method POST -Body $body -ContentType "application/json" -UseBasicParsing
        $data = $response.Content | ConvertFrom-Json
        
        if ($data.success) {
            Write-Host "  ✅ Categorized as: $($data.photo.album) | Tags: $($data.photo.aiTags -join ', ')" -ForegroundColor Green
            $results += [PSCustomObject]@{
                File = $blobName
                Album = $data.photo.album
                Tags = ($data.photo.aiTags -join ", ")
                Faces = $data.photo.faceCount
            }
        } else {
            Write-Host "  ⚠️ Analysis failed: $($data.error)" -ForegroundColor Red
        }
    } catch {
        Write-Host "  ⚠️ API call failed: $($_.Exception.Message)" -ForegroundColor Red
    }
    
    Write-Host ""
}

Write-Host "═══════════════════════════════════════" -ForegroundColor Cyan
Write-Host "Upload Complete! $($photos.Count) photos processed" -ForegroundColor Green
Write-Host ""
Write-Host "Results:" -ForegroundColor Cyan
$results | Format-Table -AutoSize
Write-Host ""
Write-Host "Photos are now live at: $SiteUrl" -ForegroundColor Green
