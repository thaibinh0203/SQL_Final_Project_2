param(
    [Parameter(Mandatory = $true)]
    [string]$BackupFile,

    [switch]$Force
)

$ErrorActionPreference = "Stop"

function Require-Env {
    param([string]$Name)

    $value = [Environment]::GetEnvironmentVariable($Name)
    if ([string]::IsNullOrWhiteSpace($value)) {
        throw "Missing required environment variable: $Name"
    }
    return $value
}

$dbHost = Require-Env "DB_HOST"
$dbPort = Require-Env "DB_PORT"
$dbUser = Require-Env "DB_USER"
$dbPassword = Require-Env "DB_PASSWORD"
$dbName = Require-Env "DB_NAME"

$backupPath = Resolve-Path -LiteralPath $BackupFile
if (-not $backupPath) {
    throw "Backup file not found: $BackupFile"
}

$mysql = Get-Command mysql -ErrorAction SilentlyContinue
if (-not $mysql) {
    throw "mysql client was not found in PATH. Install MySQL client tools before restoring."
}

Write-Host "Target database: $dbUser@$dbHost`:$dbPort/$dbName"
Write-Host "Backup file: $backupPath"

if (-not $Force) {
    $confirmation = Read-Host "This will import the backup into the target database. Type RESTORE to continue"
    if ($confirmation -ne "RESTORE") {
        Write-Host "Restore cancelled."
        exit 0
    }
}

$tempSql = $null
$inputFile = $backupPath.Path

try {
    if ($inputFile.EndsWith(".gz", [StringComparison]::OrdinalIgnoreCase)) {
        $tempSql = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "mysql_restore_$([Guid]::NewGuid()).sql")
        $source = [System.IO.File]::OpenRead($inputFile)
        try {
            $gzip = New-Object System.IO.Compression.GZipStream($source, [System.IO.Compression.CompressionMode]::Decompress)
            try {
                $target = [System.IO.File]::Create($tempSql)
                try {
                    $gzip.CopyTo($target)
                }
                finally {
                    $target.Dispose()
                }
            }
            finally {
                $gzip.Dispose()
            }
        }
        finally {
            $source.Dispose()
        }
        $inputFile = $tempSql
    }

    $env:MYSQL_PWD = $dbPassword
    Get-Content -LiteralPath $inputFile -Raw | & $mysql.Source `
        --host=$dbHost `
        --port=$dbPort `
        --user=$dbUser `
        --protocol=TCP `
        $dbName

    if ($LASTEXITCODE -ne 0) {
        throw "mysql restore failed with exit code $LASTEXITCODE"
    }

    Write-Host "Restore completed successfully."
}
finally {
    Remove-Item Env:\MYSQL_PWD -ErrorAction SilentlyContinue
    if ($tempSql -and (Test-Path -LiteralPath $tempSql)) {
        Remove-Item -LiteralPath $tempSql -Force
    }
}
