import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidContact, validateItem } from '../src/model.js';

test('shared contact validation rejects missing and non-string input without coercing it', () => {
  const object = { toString: () => 'student@example.test' };
  for (const value of [undefined, null, false, 13800000000, [], ['student@example.test'], object]) {
    assert.equal(isValidContact(value), false);
  }
  for (const value of ['', ' \t\n ', '电话：', 'QQ：', '微信：']) {
    assert.equal(isValidContact(value), false, JSON.stringify(value));
  }
});

test('email and declared contact prefixes retain their supported case and separator variants', () => {
  for (const value of [
    'student@example.test',
    '邮箱：student@example.test',
    'EMAIL:student@example.test',
    '示例 邮箱：student@example.test',
    'QQ:100000001',
    'qq：100000001',
    '示例 QQ：100000001',
    '微信：shiban_demo',
    'WeChat:shiban_demo',
    '示例 微信：shiban_demo',
  ]) {
    assert.equal(isValidContact(value), true, value);
  }
  for (const value of [
    'student@',
    '@example.test',
    'student@@example.test',
    'student.example.test',
  ]) {
    assert.equal(isValidContact(value), false, value);
  }
});

test('phones preserve landlines, mobile numbers and international prefixes with separators', () => {
  for (const value of [
    '010-12345678',
    '电话：010-12345678',
    '手机13800000000',
    'TEL:+86 (010) 12345678',
    '  tel： +86 138 0000 0000  ',
  ]) {
    assert.equal(isValidContact(value), true, value);
  }
});

test('phone punctuation cannot substitute for actual digits in incomplete contact input', () => {
  for (const value of [
    '-------',
    '(((((((',
    '电话：()--()-',
    '电话：12',
    '电话：12-34---',
    'TEL:+(12)--34',
  ]) {
    assert.equal(isValidContact(value), false, value);
  }
  // Keep the existing support for a five-digit service number with phone punctuation.
  assert.equal(isValidContact('电话：(10086)'), true);
});

test('declared QQ identifiers accept the supported length boundaries and reject invalid IDs', () => {
  for (const value of ['QQ：12345', `QQ：${'1'.repeat(13)}`]) {
    assert.equal(isValidContact(value), true, value);
  }
  for (const value of ['QQ：1234', `QQ：${'1'.repeat(14)}`, 'QQ：012345', 'QQ：12abc']) {
    assert.equal(isValidContact(value), false, value);
  }
});

test('declared WeChat identifiers enforce their existing length and initial-letter rules', () => {
  for (const value of ['微信：a12345', `wechat:${'a'.repeat(20)}`, '微信：a_b-12']) {
    assert.equal(isValidContact(value), true, value);
  }
  for (const value of ['微信：a1234', `wechat:${'a'.repeat(21)}`, '微信：123456', '微信：a1234!']) {
    assert.equal(isValidContact(value), false, value);
  }
});

test('publication applies its 80-character contact limit in addition to the shared format rule', () => {
  const contact = `${'a'.repeat(40)}@${'b'.repeat(34)}.test`;
  const item = {
    type: 'found',
    name: '红色笔记本',
    category: '书本文具',
    campus: '旗山校区',
    area: '教学楼 101',
    eventDate: '',
    contact,
  };
  assert.equal(contact.length, 80);
  assert.equal(isValidContact(contact), true);
  assert.deepEqual(validateItem(item), {});
  assert.deepEqual(validateItem({ ...item, contact: `  ${contact}  ` }), {});

  const tooLong = `a${contact}`;
  assert.equal(isValidContact(tooLong), true);
  assert.deepEqual(Object.keys(validateItem({ ...item, contact: tooLong })), ['contact']);
});
