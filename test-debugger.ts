// デバッグ機能のテスト例

import WorkerInterpreter from './workerInterpreter.js';

// テスト用のグリッドデータとヘルパー関数
const gridData = new Array(10000).fill(0);

const peekFn = (index: number) => gridData[index] ?? 0;
const pokeFn = (x: number, y: number, value: number) => {
    const index = y * 100 + x;
    if (index >= 0 && index < gridData.length) {
        gridData[index] = value;
    }
};

const logs: any[] = [];
const logFn = (...args: any[]) => {
    logs.push(args.join(' '));
};

// インタプリタの作成
const interpreter = new WorkerInterpreter({
    gridData,
    peekFn,
    pokeFn,
    logFn
});

// テストスクリプト
const script = `
0  A=10
1  B=20
2  ^LOOP
3  A=A+1
4  B=B-1
5  !(A)
6  !()
7  IF A<15 GOTO ^LOOP
8  !(B)
9  HALT
`;

// スクリプトをロード
interpreter.loadScript(script);

console.log('=== ブレークポイントとステップ実行のデモ ===\n');

// 1. ブレークポイントを行3に設定
console.log('1. 行3にブレークポイントを設定');
interpreter.setBreakpoint(3);
console.log('ブレークポイント:', interpreter.getBreakpoints());

// 2. 実行を開始
console.log('\n2. 実行開始（ブレークポイントまで）');
const gen = interpreter.run();
let result = gen.next();

while (!result.done) {
    const mode = interpreter.getDebugMode();
    const currentLine = interpreter.getCurrentLine();
    
    if (mode === 'break') {
        console.log(`\nブレークポイントで停止: 行${currentLine}`);
        console.log('変数:', Object.fromEntries(interpreter.getVariables()));
        break;
    }
    
    result = gen.next();
}

// 3. ステップイン
console.log('\n3. ステップイン実行');
interpreter.stepIn();
result = gen.next();

console.log(`実行後の行: ${interpreter.getCurrentLine()}`);
console.log('変数:', Object.fromEntries(interpreter.getVariables()));

// 4. ステップオーバー
console.log('\n4. ステップオーバー実行');
interpreter.stepOver();
result = gen.next();

console.log(`実行後の行: ${interpreter.getCurrentLine()}`);
console.log('変数:', Object.fromEntries(interpreter.getVariables()));

// 5. 続行
console.log('\n5. 続行（ブレークポイントまで）');
interpreter.continue();

while (!result.done) {
    const mode = interpreter.getDebugMode();
    const currentLine = interpreter.getCurrentLine();
    
    if (mode === 'break') {
        console.log(`\nブレークポイントで停止: 行${currentLine}`);
        console.log('変数:', Object.fromEntries(interpreter.getVariables()));
        console.log('ループカウント: A=' + interpreter.getVariable('A'));
        break;
    }
    
    result = gen.next();
}

// 6. ブレークポイントを削除して実行完了
console.log('\n6. ブレークポイントを削除して最後まで実行');
interpreter.clearBreakpoints();
interpreter.continue();

while (!result.done) {
    result = gen.next();
}

console.log('\n実行完了');
console.log('最終的な変数:', Object.fromEntries(interpreter.getVariables()));
console.log('出力ログ:', logs);
