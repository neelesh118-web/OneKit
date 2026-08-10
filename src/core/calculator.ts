/**
 * Calculator — a safe little expression evaluator for the popup.
 *
 * No eval(), no new Function: a small shunting-yard parser handles
 * + - * / % ^ ( ) and parentheses with correct precedence, and rejects
 * anything else (variables, function calls, object access). Pure local,
 * pure math.
 */

export class CalculatorError extends Error {}

const TOKEN_PATTERN = /\s*(?:(\d+\.?\d*|\.\d+)|([+\-*/%^()])|([a-zA-Z_]+))/y;

export type Token =
  | { kind: "number"; value: number }
  | { kind: "op"; value: string };

/** Tokenizes a math expression. Throws on unknown characters. */
export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;
  while (pos < input.length) {
    TOKEN_PATTERN.lastIndex = pos;
    const match = TOKEN_PATTERN.exec(input);
    if (!match || match.index !== pos) {
      // Skip whitespace if that's all that remains at this position.
      if (input[pos] === " " || input[pos] === "\t" || input[pos] === "\n") {
        pos++;
        continue;
      }
      throw new CalculatorError(`Unexpected character "${input[pos]}"`);
    }
    if (match[1] !== undefined) {
      tokens.push({ kind: "number", value: Number(match[1]) });
    } else if (match[2] !== undefined) {
      tokens.push({ kind: "op", value: match[2] });
    } else {
      throw new CalculatorError(`Unsupported word "${match[3]}"`);
    }
    pos = match.index + match[0].length;
  }
  return tokens;
}

const PRECEDENCE: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2, "%": 2, "^": 3 };

function applyOp(a: number, op: string, b: number): number {
  switch (op) {
    case "+":
      return a + b;
    case "-":
      return a - b;
    case "*":
      return a * b;
    case "/":
      if (b === 0) throw new CalculatorError("Division by zero");
      return a / b;
    case "%":
      if (b === 0) throw new CalculatorError("Modulo by zero");
      return a % b;
    case "^":
      return Math.pow(a, b);
    default:
      throw new CalculatorError(`Unknown operator "${op}"`);
  }
}

/** Shunting-yard evaluation of the token list. */
export function evaluateTokens(tokens: Token[]): number {
  const values: number[] = [];
  const ops: string[] = [];
  let expectingValue = true; // track unary minus

  for (const token of tokens) {
    if (token.kind === "number") {
      values.push(token.value);
      expectingValue = false;
    } else if (token.value === "(") {
      ops.push("(");
    } else if (token.value === ")") {
      while (ops.length > 0 && ops[ops.length - 1] !== "(") {
        applyTop(values, ops);
      }
      if (ops.length === 0) throw new CalculatorError("Unmatched closing parenthesis");
      ops.pop();
    } else if (token.value === "-" && expectingValue) {
      // Unary minus — treat as 0 - x with high precedence push.
      ops.push("u-");
    } else {
      // Binary operator: flush a pending unary minus first — it binds
      // tighter than any binary op (so `-5 + 3` negates the 5, not the
      // whole sum).
      if (ops[ops.length - 1] === "u-") {
        applyTop(values, ops);
      }
      while (ops.length > 0 && ops[ops.length - 1] !== "(" && ops[ops.length - 1] !== "u-") {
        const top = ops[ops.length - 1]!;
        if (PRECEDENCE[top]! < PRECEDENCE[token.value]!) break;
        // `^` is right-associative: equal precedence does not pop.
        if (PRECEDENCE[top]! === PRECEDENCE[token.value]! && token.value === "^") break;
        applyTop(values, ops);
      }
      ops.push(token.value);
      expectingValue = true;
    }
  }
  while (ops.length > 0) {
    if (ops[ops.length - 1] === "(") throw new CalculatorError("Unmatched opening parenthesis");
    applyTop(values, ops);
  }
  if (values.length !== 1) throw new CalculatorError("Invalid expression");
  return values[0]!;
}

function applyTop(values: number[], ops: string[]): void {
  const op = ops.pop();
  if (!op) throw new CalculatorError("Empty operator stack");
  if (op === "u-") {
    const a = values.pop();
    if (a === undefined) throw new CalculatorError("Invalid expression");
    values.push(-a);
    return;
  }
  const b = values.pop();
  const a = values.pop();
  if (a === undefined || b === undefined) throw new CalculatorError("Missing operand");
  values.push(applyOp(a, op, b));
}

/** Full pipeline: string → number. Throws CalculatorError on any problem. */
export function calculate(input: string): number {
  return evaluateTokens(tokenize(input));
}

/** Formats a result, keeping sensible precision (e.g. 0.1 + 0.2 → 0.3). */
export function formatResult(value: number): string {
  const rounded = Math.round(value * 1e10) / 1e10;
  return String(rounded);
}
