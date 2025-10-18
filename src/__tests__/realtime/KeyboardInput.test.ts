/**
 * KeyboardInput のユニットテスト
 */

import { KeyboardInput } from '../../realtime/KeyboardInput';

describe('KeyboardInput', () => {
    let keyboardInput: KeyboardInput;

    beforeEach(() => {
        keyboardInput = new KeyboardInput({ debug: false });
    });

    afterEach(() => {
        if (keyboardInput.isActive()) {
            keyboardInput.disable();
        }
    });

    describe('Constructor', () => {
        test('should create instance with default options', () => {
            expect(keyboardInput).toBeInstanceOf(KeyboardInput);
            expect(keyboardInput.isActive()).toBe(false);
            expect(keyboardInput.getBufferSize()).toBe(0);
        });

        test('should accept custom options', () => {
            const custom = new KeyboardInput({
                maxBufferSize: 500,
                debug: true
            });
            expect(custom).toBeInstanceOf(KeyboardInput);
        });
    });

    describe('Buffer Management', () => {
        test('should return 0 when buffer is empty', () => {
            expect(keyboardInput.getKey()).toBe(0);
        });

        test('should track buffer size', () => {
            expect(keyboardInput.getBufferSize()).toBe(0);
        });

        test('should clear buffer', () => {
            keyboardInput.clearBuffer();
            expect(keyboardInput.getBufferSize()).toBe(0);
        });
    });

    describe('Enable/Disable', () => {
        test('should start in disabled state', () => {
            expect(keyboardInput.isActive()).toBe(false);
        });

        test('should throw error when enabling in non-TTY environment', () => {
            // Jest runs in non-TTY environment
            if (!process.stdin.isTTY) {
                expect(() => keyboardInput.enable()).toThrow('TTY environment');
            }
        });

        test('should disable safely even if not enabled', () => {
            expect(() => keyboardInput.disable()).not.toThrow();
        });
    });

    describe('API Contract', () => {
        test('getKey should always return a number', () => {
            const key = keyboardInput.getKey();
            expect(typeof key).toBe('number');
            expect(key).toBeGreaterThanOrEqual(0);
            expect(key).toBeLessThanOrEqual(255);
        });

        test('getBufferSize should always return non-negative integer', () => {
            const size = keyboardInput.getBufferSize();
            expect(Number.isInteger(size)).toBe(true);
            expect(size).toBeGreaterThanOrEqual(0);
        });

        test('isActive should return boolean', () => {
            expect(typeof keyboardInput.isActive()).toBe('boolean');
        });
    });
});

describe('Global KeyboardInput', () => {
    // グローバルインスタンスのテストは手動テストで確認
    test.skip('should provide global instance', () => {
        // Manual testing required
    });
});
