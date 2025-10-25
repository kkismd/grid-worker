#!/usr/bin/env node
/**
 * CAS操作の簡易テストスクリプト
 * Compare-And-Swap操作が正しくパース・実行されることを確認
 */

import { Parser } from './src/parser.js';

// テストケース
const testCases = [
    {
        name: 'Basic CAS operation',
        code: 'A=<&10,20>',
        description: 'Grid[X,Y]が10なら20をセット'
    },
    {
        name: 'CAS with variables',
        code: `O=\`
N=O+1
A=<&O,N>`,
        description: '変数を使ったCAS操作'
    },
    {
        name: 'CAS with expressions',
        code: 'A=<&X+5,Y*2>',
        description: '式を含むCAS操作'
    },
    {
        name: 'CAS in retry loop',
        code: `^RETRY
O=\`
N=O+1
A=<&O,N>
;=A=0 #=^RETRY`,
        description: 'リトライループ内でのCAS'
    }
];

console.log('🧪 CAS操作パーステスト\n');

const parser = new Parser();
let passCount = 0;
let failCount = 0;

for (const testCase of testCases) {
    try {
        const result = parser.parse(testCase.code);
        
        // CAS式が含まれているか確認
        let hasCAS = false;
        const checkForCAS = (obj) => {
            if (!obj || typeof obj !== 'object') return;
            
            if (obj.type === 'CompareAndSwapExpression') {
                hasCAS = true;
                return;
            }
            
            for (const key in obj) {
                if (Array.isArray(obj[key])) {
                    obj[key].forEach(checkForCAS);
                } else if (typeof obj[key] === 'object') {
                    checkForCAS(obj[key]);
                }
            }
        };
        
        checkForCAS(result.program);
        
        if (hasCAS) {
            console.log(`✅ ${testCase.name}`);
            console.log(`   ${testCase.description}`);
            passCount++;
        } else {
            console.log(`⚠️  ${testCase.name}`);
            console.log(`   CompareAndSwapExpression が見つかりません`);
            failCount++;
        }
    } catch (error) {
        console.log(`❌ ${testCase.name}`);
        console.log(`   エラー: ${error.message}`);
        failCount++;
    }
    console.log();
}

console.log(`\n📊 結果: ${passCount} 成功, ${failCount} 失敗\n`);

if (failCount === 0) {
    console.log('🎉 すべてのテストが成功しました！');
    process.exit(0);
} else {
    console.log('💥 いくつかのテストが失敗しました。');
    process.exit(1);
}
