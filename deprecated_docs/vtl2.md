# VTL-2 (Very Tiny Language) Specification

This document outlines the specifications for VTL-2, a language designed for the Altair 8080 computer system, requiring minimal resources (768 bytes of ROM).

## 1. Core Concepts

*   **Execution Modes:**
    *   **Direct Execution:** Statements without line numbers are executed immediately.
    *   **Program Execution:** Statements with line numbers are stored as a program and executed sequentially.
*   **Line Structure:**
    *   Line numbers range from 1 to 65535.
    *   Each line must start with a line number followed by a space.
    *   Maximum line length is 72 characters.
    *   Lines end with a carriage return.
*   **Comments:** Preceded by a `)` character. Can appear after an expression or on a line by itself.
*   **Error Handling:** No explicit error messages are provided. Malformed expressions are evaluated as best as possible.

## 2. Data Types

*   **Numeric Values:** Integers ranging from 0 to 65535.
*   **ASCII Characters:** Can be treated as their corresponding decimal ASCII values and vice-versa.

## 3. Variables

*   **User Variables:** Single uppercase alphabetic characters (A-Z) and certain punctuation marks (`!"#$%&'()=-+*:;?/>.<,[]`).
*   **System Variables:** Special characters with predefined functions:
    *   `#`: Current line number. Used for `GOTO` and `IF` statements. `#=0` is ignored.
    *   `!`: Return address for `GOSUB`.
    *   `?`: Terminal input/output (`PRINT` / `INPUT`).
    *   `%`: Remainder of the last division.
    *   `'`: Random number (0-65535).
    *   `$`: Single-character input/output.
    *   `*`: Memory size.
    *   `&`: Next available byte in program buffer.
    *   `>`: Pass value to machine code / file output.
    *   `<`: File input.
    *   `:`: Start of array description.
    *   `;`: Suppresses carriage-return/line-feed after a literal print.

## 4. Operators

*   **Arithmetic:** `+`, `-`, `*`, `/`
*   **Comparison:** `=`, `>`, `<` (evaluate to 1 for true, 0 for false).
*   **Order of Operations:** Strictly left-to-right, unless modified by parentheses `()`.

## 5. Control Flow

*   **`GOTO`:** Achieved by assigning a line number to the `#` variable (e.g., `#=300`).
*   **`IF` Statements:** Conditional execution using `#` and comparison operators (e.g., `20 #=(X=25)*50` jumps to line 50 if X=25, otherwise proceeds to line 30).
*   **`GOSUB` / `RETURN`:** Implemented using `#` for subroutine calls and `!` for storing/retrieving the return address (e.g., `#!` returns from subroutine).
*   **Loops:** Constructed using combinations of `GOTO` and `IF` statements.

## 6. Data Structures

*   **Array:** A single, unnamed array is supported. Elements are accessed using a subscript expression enclosed by `:` and `)` (e.g., `:1)=0`, `:2+7)=A`). Subscripts should be 1 or greater.

## 7. Example Programs

The manual provides examples for games (HURKLE, STARSHOOTER, LUNAR LANDER, TIC-TAC-TOE), utilities (RENUMBER), and mathematical functions (FACTORIALS, FACTORS).
