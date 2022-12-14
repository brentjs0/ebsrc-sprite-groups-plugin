import { firstItem, isNullishOrEmpty, lastItem, objectHasKey, splitAndTrimCSV, substringByLength } from './utility';

export type CA65Line =
{
    lineNumber: number;
    sourceExpressionText: string;
    label: string | undefined;
    instruction: string | undefined;
    operandList: string | undefined;
    comment: string | undefined;
    isSignificantToAssembler: boolean;
}

export type CA65LineWithOperands = CA65Line & { operandList: string };

export type CA65Datum =
{
    line: CA65Line;
    type: DatumTypeString;
    sourceExpressionText: string;
    numericValue: number;
}

export type DatumTypeString = 'byte' | 'word' | 'dword';

export type CA65PseudoFunctionIdentifier = '.LOWORD' | '.BANKBYTE';

export function readCA65LineData(line: CA65LineWithOperands): CA65Datum[]
{
    if (!line.operandList)
    {
        return [];
    }

    switch (line.instruction)
    {
        case '.BYTE':
        case '.WORD':
        case '.DWORD':
        {
            const datumType = line.instruction.substring(1).toLowerCase();
            if (isDatumTypeString(datumType))
            {
                return readDataFromOperandList(datumType, line);
            }
            break;
        }
        case 'SPRITES':
            return readSpritesMacroData(line);
        case 'SPRITES2':
            return readSprites2MacroData(line);
    }

    throw new Error(`Data reading behavior is not implemented for "${line.instruction}" instructions.`);
}

export function isDatumTypeString(str: string): str is DatumTypeString
{
    return ['byte', 'word', 'dword'].includes(str);
}

export function countCA65DatumBytes(data: CA65Datum[]): number
{
    let byteCount = 0;
    for (const datum of data)
    {
        switch (datum.type)
        {
            case 'byte':
                byteCount++;
                break;
            case 'word':
                byteCount += 2;
                break;
            case 'dword':
                byteCount += 4;
                break;
        }
    }

    return byteCount;
}

export function getArgumentListFromPseudoFunctionCall(pseudoFunctionCall: string): string
{
    return pseudoFunctionCall.slice(
        pseudoFunctionCall.indexOf('(') + 1,
        pseudoFunctionCall.lastIndexOf(')'));
}

export function isCA65StringLiteral(value: unknown): value is string
{
    return typeof value === 'string' &&
        value.length >= 2 &&
        firstItem(value) === '"' &&
        lastItem(value) === '"';
}

export function getTextFromCA65StringLiteral(stringExpression: string): string
{
    return substringByLength(stringExpression, 1, stringExpression.length - 2);
}

export function parseCA65Number(numberString: string | undefined): number
{
    if (numberString)
    {
        if (numberString.match(/^\$[A-Fa-f0-9]*$/))
        {
            return Number.parseInt(numberString.substring(1), 16);
        }
        if (numberString.match(/^[A-Fa-f0-9]*[Hh]$/))
        {
            return Number.parseInt(numberString.substring(0, numberString.length - 2), 16);
        }
        if (numberString.match(/^%[01]*$/))
        {
            return Number.parseInt(numberString.substring(1), 2);
        }
        if (numberString.match(/^[0-9]*$/))
        {
            return Number.parseInt(numberString, 10);
        }
    }

    return NaN;
}

export function* readCA65Lines(fileContents: string, startLabel: string | undefined = undefined): Generator<CA65Line>
{
    let labelFound: boolean = startLabel === undefined;
    let lineNumber = 0;

    for (const regExpMatch of fileContents.matchAll(ca65LinePattern))
    {
        lineNumber++;
        labelFound = labelFound || (regExpMatch.groups?.label !== undefined && regExpMatch.groups.label === startLabel);
        if (labelFound)
        {
            yield createLine(lineNumber, regExpMatch);
        }
    }
}

export function lineHasOperandList(ca65Line: CA65Line): ca65Line is CA65LineWithOperands
{
    return objectHasKey(ca65Line, 'operandList') &&
        typeof ca65Line.operandList === 'string';
}

const ca65LinePattern = /^[\t ]*(?:(?<label>@?[A-Za-z][A-Za-z0-9_]*):)?[\t ]*(?:(?<instruction>\.?[A-Za-z_0-9]*)[\t ]*(?<operands>[^\n\r;]*[^\n\r; ]+))?[\t ]*(?:;?(?<comment>[^\n\r]*))?/gm;

function createLine(lineNumber: number, regExpMatch: RegExpMatchArray): CA65Line
{
    const line =
    {
        lineNumber: lineNumber,
        sourceExpressionText: regExpMatch[0],
        label: regExpMatch.groups?.label,
        instruction: regExpMatch.groups?.instruction,
        operandList: regExpMatch.groups?.operands,
        comment: regExpMatch.groups?.comment,
        isSignificantToAssembler: !isNullishOrEmpty(regExpMatch.groups?.label) || !isNullishOrEmpty(regExpMatch.groups?.instruction)
    };

    return line;
}

function readDataFromOperandList(datumType: DatumTypeString, line: CA65LineWithOperands): CA65Datum[] 
{
    return splitAndTrimCSV(line.operandList)
        .map(o =>
            ({
                line: line,
                type: datumType,
                sourceExpressionText: o,
                numericValue: parseCA65Number(o)
            }));
}

function readSpritesMacroData(line: CA65LineWithOperands): CA65Datum[]
{
    const operands: string[] = splitAndTrimCSV(line.operandList);
    const bankByteDatum: CA65Datum =
    {
        line: line,
        type: 'byte',
        sourceExpressionText: `.BANKBYTE(${operands.shift()})`,
        numericValue: NaN
    };

    return [bankByteDatum, ...readSpritesOperandListData(line, operands)];
}

function readSprites2MacroData(line: CA65LineWithOperands): CA65Datum[]
{
    return readSpritesOperandListData(line, splitAndTrimCSV(line.operandList).slice(1));
}

function readSpritesOperandListData(line: CA65Line, spriteOperands: string[]): CA65Datum[]
{
    return spriteOperands.map(o =>
        ({
            line: line,
            type: 'word',
            sourceExpressionText: `.LOWORD(${o})`,
            numericValue: NaN
        }));
}