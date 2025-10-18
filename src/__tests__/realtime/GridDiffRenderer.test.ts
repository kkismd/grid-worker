// src/__tests__/realtime/GridDiffRenderer.test.ts
// GridDiffRendererの単体テスト

import { GridDiffRenderer } from '../../realtime/GridDiffRenderer.js';

describe('GridDiffRenderer', () => {
    let renderer: GridDiffRenderer;

    beforeEach(() => {
        renderer = new GridDiffRenderer(100, 100, 10, 10);
    });

    describe('初期化', () => {
        test('デフォルトサイズで初期化される', () => {
            expect(renderer).toBeDefined();
        });

        test('カスタムサイズで初期化される', () => {
            const customRenderer = new GridDiffRenderer(100, 100, 20, 20);
            expect(customRenderer).toBeDefined();
        });
    });

    describe('initScreen', () => {
        test('初期画面を生成する', () => {
            const output = renderer.initScreen();
            
            // 画面クリア + ヘッダー + グリッド行が含まれる
            expect(output).toContain('\x1b[2J');  // Clear screen
            expect(output).toContain('\x1b[H');   // Home
            expect(output).toContain('0123456789'); // Header
            expect(output).toContain('----------'); // Separator
        });
    });

    describe('renderDiff', () => {
        test('変更がない場合は空文字を返す', () => {
            const gridData = new Array(10000).fill(0);
            const output = renderer.renderDiff(gridData);
            
            // 初回は全体が変更とみなされる
            expect(output).not.toBe('');
            
            // 2回目は変更なし
            const output2 = renderer.renderDiff(gridData);
            expect(output2).toBe('');
        });

        test('変更された座標のみ描画する', () => {
            const gridData = new Array(10000).fill(0);
            
            // 初回レンダリング
            renderer.renderDiff(gridData);
            
            // (5, 5) を変更
            gridData[5 * 100 + 5] = 255;
            const output = renderer.renderDiff(gridData);
            
            // カーソル移動とキャラクターが含まれる
            expect(output).toContain('\x1b[');  // ANSI escape
            expect(output).not.toBe('');
        });

        test('複数の変更を一度に描画できる', () => {
            const gridData = new Array(10000).fill(0);
            renderer.renderDiff(gridData);
            
            // 複数箇所を変更
            gridData[0] = 100;
            gridData[1] = 150;
            gridData[2] = 200;
            
            const output = renderer.renderDiff(gridData);
            expect(output).not.toBe('');
        });
    });

    describe('fullRedraw', () => {
        test('全体を強制的に再描画する', () => {
            const gridData = new Array(10000).fill(128);
            const output = renderer.fullRedraw(gridData);
            
            // initScreen + renderDiff
            expect(output).toContain('\x1b[2J');
            expect(output).not.toBe('');
        });
    });

    describe('静的メソッド', () => {
        test('hideCursor はANSIエスケープを返す', () => {
            expect(GridDiffRenderer.hideCursor()).toBe('\x1b[?25l');
        });

        test('showCursor はANSIエスケープを返す', () => {
            expect(GridDiffRenderer.showCursor()).toBe('\x1b[?25h');
        });

        test('clearScreen はANSIエスケープを返す', () => {
            expect(GridDiffRenderer.clearScreen()).toContain('\x1b[2J');
        });
    });
});
