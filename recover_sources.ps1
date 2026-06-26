# Recovery script: Extract original TypeScript from source maps
# Source maps contain the "sources" and we can use the .js.map to trace back

$distDir = "d:\ppw-staff-main\.deploy_stage\dist\src"
$srcDir = "d:\ppw-staff-main\backend\src"

# List of corrupted files (relative to src/)
$corrupted = @(
    "auth\auth.guard.ts",
    "auth\auth.module.ts",
    "auth\jwt.strategy.ts",
    "auth\permissions.guard.ts",
    "entities\godown-entry.entity.ts",
    "entities\order-detail.entity.ts",
    "entities\order.entity.ts",
    "entities\stock-item.entity.ts",
    "item-details\item-details.controller.ts",
    "item-details\item-details.module.ts",
    "item-details\media.controller.ts",
    "scripts\check-distribution.ts",
    "scripts\check-item-mismatch.ts",
    "scripts\check-last-order.ts",
    "scripts\hard-sync-stock.ts",
    "scripts\restore-admin.ts",
    "scripts\seed-stock-items.ts",
    "scripts\seed-test-orders.ts",
    "scripts\stress-test-item-names.ts",
    "app.controller.spec.ts",
    "app.controller.ts",
    "app.module.ts",
    "app.service.ts",
    "godown.controller.ts",
    "main.ts",
    "schema-sync.service.ts",
    "spa.filter.ts",
    "tally.service.ts",
    "user.controller.ts"
)

foreach ($tsFile in $corrupted) {
    $jsFile = $tsFile -replace '\.ts$', '.js'
    $jsPath = Join-Path $distDir $jsFile
    
    if (Test-Path $jsPath) {
        $content = Get-Content $jsPath -Raw
        Write-Output "RECOVERED: $tsFile (from $jsFile, $($content.Length) chars)"
    } else {
        Write-Output "MISSING: $tsFile (no compiled JS found at $jsPath)"
    }
}
