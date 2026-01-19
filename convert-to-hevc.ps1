# HEVC Conversion Script for Plex YouTube Library
# Uses NVIDIA NVENC for hardware-accelerated encoding
# Idempotent - safe to stop and restart

$SourceDir = "E:\Plex\YouTube"
$BackupDir = "E:\Plex\YouTube\_originals_backup"
$LogFile = "E:\Plex\YouTube\_conversion_log.txt"

# Ensure backup directory exists
if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] $Message"
    Write-Host $logMessage
    Add-Content -Path $LogFile -Value $logMessage
}

function Get-VideoCodec {
    param([string]$FilePath)
    try {
        $output = & ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 "$FilePath" 2>&1
        return $output.Trim()
    } catch {
        return "unknown"
    }
}

function Convert-ToHevc {
    param([string]$InputFile)
    
    $fileName = [System.IO.Path]::GetFileName($InputFile)
    $tempOutput = [System.IO.Path]::Combine($SourceDir, "_temp_converting.mp4")
    $backupPath = [System.IO.Path]::Combine($BackupDir, $fileName)
    
    Write-Log "Converting: $fileName"
    
    # Convert using NVENC with balanced quality/size settings
    # Using & operator with proper quoting for special characters in filenames
    $exitCode = 0
    try {
        # Run ffmpeg - the quotes around paths handle special characters
        & ffmpeg -hide_banner -loglevel error -stats -i "$InputFile" -c:v hevc_nvenc -preset p4 -cq 28 -maxrate 8M -bufsize 16M -c:a aac -b:a 192k -movflags +faststart -y "$tempOutput"
        $exitCode = $LASTEXITCODE
    } catch {
        Write-Log "Exception during conversion: $_"
        $exitCode = 1
    }
    
    $process = [PSCustomObject]@{ ExitCode = $exitCode }
    
    if ($process.ExitCode -eq 0 -and (Test-Path $tempOutput)) {
        $originalSize = (Get-Item $InputFile).Length
        $newSize = (Get-Item $tempOutput).Length
        
        # Verify the new file is reasonable (at least 10KB and not way bigger than original)
        if ($newSize -gt 10KB) {
            # Move original to backup
            Move-Item -Path $InputFile -Destination $backupPath -Force
            
            # Move converted file to original location
            Move-Item -Path $tempOutput -Destination $InputFile -Force
            
            $savedMB = [math]::Round(($originalSize - $newSize) / 1MB, 2)
            $ratio = [math]::Round($newSize / $originalSize * 100, 1)
            Write-Log "SUCCESS: $fileName (Original: $([math]::Round($originalSize/1MB, 2))MB -> New: $([math]::Round($newSize/1MB, 2))MB, $ratio%)"
            return $true
        } else {
            Write-Log "ERROR: Output file too small, keeping original: $fileName"
            Remove-Item -Path $tempOutput -Force -ErrorAction SilentlyContinue
            return $false
        }
    } else {
        Write-Log "ERROR: Conversion failed for: $fileName"
        Remove-Item -Path $tempOutput -Force -ErrorAction SilentlyContinue
        return $false
    }
}

# Main execution
Write-Log "=========================================="
Write-Log "Starting HEVC conversion batch"
Write-Log "Source: $SourceDir"
Write-Log "Backup: $BackupDir"
Write-Log "=========================================="

# Get all mp4 files in source directory (excluding backup folder and temp files)
$allFiles = Get-ChildItem -Path $SourceDir -Filter "*.mp4" -File | 
    Where-Object { $_.DirectoryName -eq $SourceDir -and $_.Name -ne "_temp_converting.mp4" }

$totalFiles = $allFiles.Count
Write-Log "Found $totalFiles MP4 files in source directory"

# Get already backed up files (these are already converted)
$backedUpFiles = Get-ChildItem -Path $BackupDir -Filter "*.mp4" -File | 
    Select-Object -ExpandProperty Name

Write-Log "Found $($backedUpFiles.Count) files already backed up (converted)"

# Filter to files that need processing
$filesToProcess = $allFiles | Where-Object { $_.Name -notin $backedUpFiles }
Write-Log "Files to check: $($filesToProcess.Count)"

$converted = 0
$skipped = 0
$failed = 0
$current = 0

foreach ($file in $filesToProcess) {
    $current++
    $fileName = $file.Name
    
    Write-Log "[$current/$($filesToProcess.Count)] Checking: $fileName"
    
    # Check current codec
    $codec = Get-VideoCodec -FilePath $file.FullName
    
    if ($codec -eq "hevc" -or $codec -eq "h265") {
        Write-Log "SKIP: Already HEVC - $fileName"
        $skipped++
        continue
    }
    
    if ($codec -eq "h264" -or $codec -eq "avc") {
        Write-Log "SKIP: H.264 is Apple TV compatible - $fileName"
        $skipped++
        continue
    }
    
    if ($codec -eq "unknown" -or $codec -eq "" -or $codec -match "error") {
        Write-Log "SKIP: Could not read codec (possibly corrupt) - $fileName"
        $skipped++
        continue
    }
    
    Write-Log "Current codec: $codec - needs conversion"
    
    # Convert the file
    $success = Convert-ToHevc -InputFile $file.FullName
    
    if ($success) {
        $converted++
    } else {
        $failed++
    }
    
    # Progress summary every 10 files
    if ($current % 10 -eq 0) {
        Write-Log "--- Progress: $current/$($filesToProcess.Count) | Converted: $converted | Skipped: $skipped | Failed: $failed ---"
    }
}

Write-Log "=========================================="
Write-Log "Conversion batch complete!"
Write-Log "Total processed: $current"
Write-Log "Converted: $converted"
Write-Log "Skipped (already HEVC): $skipped"
Write-Log "Failed: $failed"
Write-Log "=========================================="
