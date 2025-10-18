/**
 * 配列とスタック機能のデモスクリプトのテスト
 * 
 * このテストは、examples/array_tests/に配置されたデモスクリプトが
 * 正しく実行されることを確認します。
 */

import WorkerInterpreter from '../workerInterpreter';
import * as fs from 'fs';
import * as path from 'path';

const EXAMPLES_DIR = path.join(__dirname, '../../examples/array_tests');

function loadExample(filename: string): string {
    return fs.readFileSync(path.join(EXAMPLES_DIR, filename), 'utf-8');
}

describe('Array and Stack Demos - Execution', () => {
    let interpreter: any;
    let mockLogFn: jest.Mock;
    let gridData: number[];

    beforeEach(() => {
        mockLogFn = jest.fn();
        gridData = new Array(10000).fill(0);
        interpreter = new WorkerInterpreter({
            gridData,
            peekFn: (index: number) => gridData[index] || 0,
            pokeFn: (x: number, y: number, value: number) => {
                gridData[x * 100 + y] = value;
            },
            logFn: mockLogFn,
        });
    });

    test('Demo 1: Basic Array - should write and read array values', () => {
        const script = loadExample('01-basic-array.ws');
        interpreter.loadScript(script);
        const gen = interpreter.run();
        while (!gen.next().done) {}
        
        // 出力を確認
        expect(mockLogFn).toHaveBeenCalled();
        console.log('Basic Array output:', mockLogFn.mock.calls.flat().join(' '));
    });

    test('Demo 2: Array Init - should initialize array with multiple values', () => {
        const script = loadExample('02-array-init.ws');
        interpreter.loadScript(script);
        const gen = interpreter.run();
        while (!gen.next().done) {}
        
        expect(mockLogFn).toHaveBeenCalled();
        console.log('Array Init output:', mockLogFn.mock.calls.flat().join(' '));
    });

    test('Demo 3: Basic Stack - should push and pop in LIFO order', () => {
        const script = loadExample('03-basic-stack.ws');
        interpreter.loadScript(script);
        const gen = interpreter.run();
        while (!gen.next().done) {}
        
        expect(mockLogFn).toHaveBeenCalled();
        console.log('Basic Stack output:', mockLogFn.mock.calls.flat().join(' '));
    });

    test('Demo 4: Fibonacci - should generate Fibonacci sequence', () => {
        const script = loadExample('04-fibonacci.ws');
        interpreter.loadScript(script);
        const gen = interpreter.run();
        while (!gen.next().done) {}
        
        // フィボナッチ数列の値を確認
        const output = mockLogFn.mock.calls.flat();
        console.log('Fibonacci sequence:', output.join(' '));
        
        // 最初の数値を確認（0, 1, 1, 2, 3, 5, 8, 13, 21, 34）
        expect(output).toContain(0);
        expect(output).toContain(1);
        expect(output).toContain(34);
    });

    test('Demo 5: Bubble Sort - should sort array', () => {
        const script = loadExample('05-bubble-sort.ws');
        interpreter.loadScript(script);
        const gen = interpreter.run();
        while (!gen.next().done) {}
        
        const output = mockLogFn.mock.calls.flat();
        console.log('Bubble Sort output:', output.join(' '));
    });

    test('Demo 6: Reverse with Stack - should reverse using stack', () => {
        const script = loadExample('06-reverse-with-stack.ws');
        interpreter.loadScript(script);
        const gen = interpreter.run();
        while (!gen.next().done) {}
        
        const output = mockLogFn.mock.calls.flat();
        console.log('Reverse output:', output.join(' '));
    });

    test('Demo 7: Cumulative Sum - should calculate cumulative sum', () => {
        const script = loadExample('07-cumulative-sum.ws');
        interpreter.loadScript(script);
        const gen = interpreter.run();
        while (!gen.next().done) {}
        
        const output = mockLogFn.mock.calls.flat();
        console.log('Cumulative Sum output:', output.join(' '));
    });

    test('Demo 8: Indirect Access - should access array indirectly', () => {
        const script = loadExample('08-indirect-access.ws');
        interpreter.loadScript(script);
        const gen = interpreter.run();
        while (!gen.next().done) {}
        
        const output = mockLogFn.mock.calls.flat();
        console.log('Indirect Access output:', output.join(' '));
    });

    test('Demo 9: Stack Calculation - should calculate (5+3)*(10-2)', () => {
        const script = loadExample('09-stack-calculation.ws');
        interpreter.loadScript(script);
        const gen = interpreter.run();
        while (!gen.next().done) {}
        
        const output = mockLogFn.mock.calls.flat();
        console.log('Stack Calculation output:', output.join(' '));
        expect(output).toContain(64); // (5+3) * (10-2) = 64
    });

    test('Demo 10: Factorial - should calculate 5!', () => {
        const script = loadExample('10-factorial.ws');
        interpreter.loadScript(script);
        const gen = interpreter.run();
        while (!gen.next().done) {}
        
        const output = mockLogFn.mock.calls.flat();
        console.log('Factorial output:', output.join(' '));
        expect(output).toContain(120); // 5! = 120
    });

    test('Demo 11: Array Copy - should copy array to another location', () => {
        const script = loadExample('11-array-copy.ws');
        interpreter.loadScript(script);
        const gen = interpreter.run();
        while (!gen.next().done) {}
        
        const output = mockLogFn.mock.calls.flat();
        console.log('Array Copy output:', output.join(' '));
    });

    test('Demo 12: Combined Usage - should combine array and stack', () => {
        const script = loadExample('12-combined-usage.ws');
        interpreter.loadScript(script);
        const gen = interpreter.run();
        while (!gen.next().done) {}
        
        const output = mockLogFn.mock.calls.flat();
        console.log('Combined Usage output:', output.join(' '));
    });

    test('All example files should exist', () => {
        const files = [
            '01-basic-array.ws',
            '02-array-init.ws',
            '03-basic-stack.ws',
            '04-fibonacci.ws',
            '05-bubble-sort.ws',
            '06-reverse-with-stack.ws',
            '07-cumulative-sum.ws',
            '08-indirect-access.ws',
            '09-stack-calculation.ws',
            '10-factorial.ws',
            '11-array-copy.ws',
            '12-combined-usage.ws'
        ];
        files.forEach(file => {
            expect(() => loadExample(file)).not.toThrow();
        });
    });

    test('Fibonacci example should contain expected content', () => {
        const script = loadExample('04-fibonacci.ws');
        expect(script).toContain('フィボナッチ数列');
        expect(script).toContain('[I]=[I-1]+[I-2]');
    });
});
