// test-vt100-scrolling.js - VT-100スクロール領域テスト

console.log('\n=== VT-100 Scrolling Region Test ===\n');

// VT-100/ANSI エスケープシーケンス
const CSI = '\x1b[';

// 1. DECSTBM (Set Top and Bottom Margins) - スクロール領域設定
// ESC [ top ; bottom r
function setScrollRegion(top, bottom) {
    return `${CSI}${top};${bottom}r`;
}

// 2. 画面クリア
function clearScreen() {
    return `${CSI}2J${CSI}H`;
}

// 3. カーソル位置設定
function setCursor(row, col) {
    return `${CSI}${row};${col}H`;
}

// 4. スクロール領域リセット
function resetScrollRegion() {
    return `${CSI}r`;
}

// テスト1: 基本的なスクロール領域設定
console.log('Test 1: 基本的なスクロール領域設定');
console.log('---------------------------------------');

// 画面クリア
process.stdout.write(clearScreen());

// 上部固定領域（1-5行目）
process.stdout.write(setCursor(1, 1));
process.stdout.write('┌─────────────────────────────────┐');
process.stdout.write(setCursor(2, 1));
process.stdout.write('│  Fixed Header Area (Lines 1-5) │');
process.stdout.write(setCursor(3, 1));
process.stdout.write('│  This area should NOT scroll    │');
process.stdout.write(setCursor(4, 1));
process.stdout.write('└─────────────────────────────────┘');

// スクロール領域を6-20行目に設定
process.stdout.write(setScrollRegion(6, 20));

// スクロール領域にテキストを出力
process.stdout.write(setCursor(6, 1));
process.stdout.write('Scrolling Area (Lines 6-20):\n');

for (let i = 1; i <= 30; i++) {
    process.stdout.write(`Line ${i} - This line should scroll\n`);
}

// 下部固定領域（21行目以降）
process.stdout.write(resetScrollRegion());
process.stdout.write(setCursor(22, 1));
process.stdout.write('┌─────────────────────────────────┐');
process.stdout.write(setCursor(23, 1));
process.stdout.write('│ Fixed Footer Area (Line 22-24)  │');
process.stdout.write(setCursor(24, 1));
process.stdout.write('└─────────────────────────────────┘');

// カーソルを最終行に移動
process.stdout.write(setCursor(26, 1));

console.log('\n');
console.log('Test completed!');
console.log('Did you see:');
console.log('  - Fixed header at top (lines 1-5)?');
console.log('  - Scrolling content in middle (lines 6-20)?');
console.log('  - Fixed footer at bottom (lines 22-24)?');
console.log('\nPress Ctrl+C to exit');

// プログラムを終了させない
process.stdin.resume();
