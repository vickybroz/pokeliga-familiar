param(
  [string]$ExcelFile = 'Pokeliga Familiar (1).xlsx'
)

$ErrorActionPreference='Stop'

$path = Join-Path (Get-Location) $ExcelFile
if (!(Test-Path $path)) {
  throw "No se encontro el archivo: $path"
}

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$wb = $excel.Workbooks.Open($path)
$wsAnnual = $wb.Worksheets.Item('Tabla anual')

$scoring = [ordered]@{
  team = @()
  quantity = @()
  speed = @()
  mediaQuantity = $wsAnnual.Cells.Item(5,4).Value2
  mediaSpeed = $wsAnnual.Cells.Item(5,6).Value2
}
for($r=2;$r -le 4;$r++){
  $scoring.team += [ordered]@{ position = [int]$wsAnnual.Cells.Item($r,1).Value2; points = [int]$wsAnnual.Cells.Item($r,2).Value2 }
  $scoring.quantity += [ordered]@{ position = [int]$wsAnnual.Cells.Item($r,3).Value2; points = [int]$wsAnnual.Cells.Item($r,4).Value2 }
  $scoring.speed += [ordered]@{ position = [int]$wsAnnual.Cells.Item($r,5).Value2; points = [int]$wsAnnual.Cells.Item($r,6).Value2 }
}

$weekHeaders = @()
for($c=2;$c -le 200;$c++){
  $h = [string]$wsAnnual.Cells.Item(8,$c).Text
  if([string]::IsNullOrWhiteSpace($h)){ continue }
  if($h -eq 'Total'){ break }
  $weekHeaders += $h
}
$totalCol = 2 + $weekHeaders.Count

$annualRows = @()
for($r=9;$r -le 19;$r++){
  $player = [string]$wsAnnual.Cells.Item($r,1).Text
  if([string]::IsNullOrWhiteSpace($player)){ continue }
  $weekPoints = [ordered]@{}
  for($i=0;$i -lt $weekHeaders.Count;$i++){
    $col = 2 + $i
    $weekPoints[$weekHeaders[$i]] = [int]($wsAnnual.Cells.Item($r,$col).Value2)
  }
  $total = [int]($wsAnnual.Cells.Item($r,$totalCol).Value2)
  $annualRows += [ordered]@{ player = $player; weeks = $weekPoints; total = $total }
}

$ranking = $annualRows | Sort-Object -Property total -Descending | ForEach-Object -Begin { $pos=1 } -Process {
  [ordered]@{ position = $pos; player = $_.player; total = $_.total }
  $pos++
}

function Get-WeeklyData($wb, $sheetName, $weekLabel){
  $ws = $wb.Worksheets.Item($sheetName)

  $teams = @()
  for($r=9;$r -le 12;$r++){
    $teamName = [string]$ws.Cells.Item($r,1).Text
    if([string]::IsNullOrWhiteSpace($teamName)){ continue }
    $teams += [ordered]@{
      team = $teamName
      place = [int]$ws.Cells.Item($r,2).Value2
      finishTime = [string]$ws.Cells.Item($r,3).Text
      hours = [double]$ws.Cells.Item($r,4).Value2
      points = [int]$ws.Cells.Item($r,5).Value2
    }
  }

  $participants = @()
  $lastRow = $ws.UsedRange.Rows.Count
  for($r=14;$r -le $lastRow;$r++){
    $name = [string]$ws.Cells.Item($r,2).Text
    if([string]::IsNullOrWhiteSpace($name)){ continue }
    $participants += [ordered]@{
      position = [int]$ws.Cells.Item($r,1).Value2
      name = $name
      team = [string]$ws.Cells.Item($r,3).Text
      quantity = [double]$ws.Cells.Item($r,4).Value2
      speedBonus = [double]$ws.Cells.Item($r,5).Value2
      teamPoints = [double]$ws.Cells.Item($r,6).Value2
      quantityPoints = [double]$ws.Cells.Item($r,7).Value2
      speedPoints = [double]$ws.Cells.Item($r,8).Value2
      totalPoints = [double]$ws.Cells.Item($r,9).Value2
    }
  }

  [ordered]@{
    week = $weekLabel
    sheet = $sheetName
    challenge = [string]$ws.Cells.Item(1,2).Text
    start = [string]$ws.Cells.Item(2,2).Text
    end = [string]$ws.Cells.Item(3,2).Text
    durationHours = [double]$ws.Cells.Item(4,2).Value2
    officialRate = [double]$ws.Cells.Item(5,2).Value2
    mediaQuantity = [double]$ws.Cells.Item(6,2).Value2
    teams = $teams
    participants = $participants
  }
}

$history = @()
foreach($week in $weekHeaders){
  $sheet = $week.Replace('/','')
  $exists = $false
  foreach($s in $wb.Worksheets){ if($s.Name -eq $sheet){ $exists = $true; break } }
  if($exists){ $history += (Get-WeeklyData $wb $sheet $week) }
}

$latest = $null
if($history.Count -gt 0){ $latest = $history[$history.Count-1] }

$data = [ordered]@{
  generatedAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
  scoring = $scoring
  annual = [ordered]@{
    weekLabels = $weekHeaders
    players = $annualRows
    ranking = $ranking
  }
  latestCompetition = $latest
  history = $history
}

$json = $data | ConvertTo-Json -Depth 10
Set-Content -Path 'data.json' -Value $json -Encoding UTF8
Set-Content -Path 'data.js' -Value ('window.POKELIGA_DATA = ' + $json + ';') -Encoding UTF8

$wb.Close($false)
$excel.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($wb) | Out-Null
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
[GC]::Collect()
[GC]::WaitForPendingFinalizers()

Write-Host 'Listo: data.json y data.js actualizados'
