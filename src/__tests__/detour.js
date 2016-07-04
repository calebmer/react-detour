import 'test-dom'

import test from 'ava'
import React from 'react'
import { mount } from 'enzyme'
import { PathProvider, withRoutes } from '../detour.ts'

const createTestPath = element => (path, text) => {
  const wrapper = mount(
    <PathProvider path={path}>
      {element}
    </PathProvider>
  )
  return new Promise(resolve => setImmediate(() => {
    resolve(wrapper.text())
  }))
}

test('withRoutes will do basic routing', async t => {
  const A = () => <div>a</div>
  const B = () => <div>b</div>

  const C = withRoutes([
    { path: '/a', component: () => A },
    { path: '/b', component: () => B },
  ])(({ children }) => children || <div>c</div>)

  const testPath = createTestPath(<C/>)

  t.is(await testPath('/'), 'c')
  t.is(await testPath('/not-found'), 'c')
  t.is(await testPath('/a'), 'a')
  t.is(await testPath('/b'), 'b')
  t.is(await testPath('/a/b/c'), 'a')
  t.is(await testPath('/b/d'), 'b')
})

test('withRoutes should allow nested routing', async t => {
  const A = () => <div>a</div>
  const B = () => <div>b</div>

  const C = withRoutes([
    { path: '/a', component: () => A },
    { path: '/b', component: () => B },
  ])(({ children }) => children || <div>c</div>)

  const D = () => <div>d</div>

  const E = withRoutes([
    { path: '/c', component: () => C },
    { path: '/d', component: () => D },
  ])(({ children }) => children || <div>e</div>)

  const testPath = createTestPath(<E/>)

  t.is(await testPath('/'), 'e')
  t.is(await testPath('/not-found'), 'e')
  t.is(await testPath('/c'), 'c')
  t.is(await testPath('/d'), 'd')
  t.is(await testPath('/d/e'), 'd')
  t.is(await testPath('/c/a'), 'a')
  t.is(await testPath('/c/a/b'), 'a')
  t.is(await testPath('/c/b'), 'b')
  t.is(await testPath('/c/not-found'), 'c')
})

test('withRoutes will allow index routes', async t => {
  const A = () => <div>a</div>
  const B = () => <div>b</div>
  const C = () => <div>c</div>

  const D = withRoutes([
    { path: '/', component: () => C },
    { path: '/a', component: () => A },
    { path: '/b', component: () => B },
  ])(({ children }) => children || <div>d</div>)

  const testPath = createTestPath(<D/>)

  t.is(await testPath('/'), 'c')
  t.is(await testPath('/not-found'), 'd')
  t.is(await testPath('/a'), 'a')
  t.is(await testPath('/b'), 'b')
  t.is(await testPath('/a/b/c'), 'a')
  t.is(await testPath('/b/d'), 'b')
})

test('withRoutes will allow for not found routes', async t => {
  const A = () => <div>a</div>
  const B = () => <div>b</div>
  const C = () => <div>c</div>

  const D = withRoutes([
    { path: '/a', component: () => A },
    { path: '/*', component: () => B },
    { path: '/c', component: () => C },
  ])(({ children }) => children || <div>d</div>)

  const testPath = createTestPath(<D/>)

  t.is(await testPath('/'), 'b')
  t.is(await testPath('/not-found'), 'b')
  t.is(await testPath('/a'), 'a')
  t.is(await testPath('/b'), 'b')
  t.is(await testPath('/c'), 'b')
  t.is(await testPath('/a/b'), 'a')
})

test('withRoutes will pass down path params', async t => {
  const A = ({ a, b }) => <div>{a + b}</div>

  const B = withRoutes([
    { path: '/:a/:b', component: () => A },
  ])(({ children }) => children || <div>b</div>)

  const testPath = createTestPath(<B/>)

  t.is(await testPath('/'), 'b')
  t.is(await testPath('/a'), 'b')
  t.is(await testPath('/a/b'), 'ab')
  t.is(await testPath('/c/d'), 'cd')
  t.is(await testPath('/4/2'), '42')
  t.is(await testPath('/a/b/c'), 'ab')
})

test('withRoutes will allow named component handlers', async t => {
  const A = () => <div>a</div>
  const B = () => <div>b</div>
  const C = () => <div>c</div>
  const D = () => <div>d</div>

  const E = withRoutes([
    {
      path: '/ab',
      component: {
        one: () => A,
        two: () => B,
      },
    },
    {
      path: '/cd',
      component: {
        one: () => C,
        two: () => D,
      },
    },
  ])(({ outlets: { one, two } }) =>
    <div>
      {one}
      {two}
    </div>
  )

  const testPath = createTestPath(<E/>)

  t.is(await testPath('/'), '')
  t.is(await testPath('/ab'), 'ab')
  t.is(await testPath('/cd'), 'cd')
  t.is(await testPath('/ab/cd'), 'ab')
})

test('withRoutes will use the default named handler in children', async t => {
  const A = () => <div>a</div>
  const B = () => <div>b</div>

  const C = withRoutes([
    {
      path: '/a',
      component: {
        default: () => A,
      },
    },
    {
      path: '/b',
      component: {
        default: () => B,
      },
    },
  ])(({ children }) => children || <div>c</div>)

  const testPath = createTestPath(<C/>)

  t.is(await testPath('/'), 'c')
  t.is(await testPath('/a'), 'a')
  t.is(await testPath('/b'), 'b')
  t.is(await testPath('/d'), 'c')
  t.is(await testPath('/a/b'), 'a')
})

test('withRoutes should allow nested routing with named outlets', async t => {
  const A = () => <div>a</div>
  const B = () => <div>b</div>

  const C = withRoutes([
    { path: '/a', component: { c: () => A } },
    { path: '/b', component: { c: () => B } },
  ])(({ outlets }) => outlets.c || <div>c</div>)

  const D = () => <div>d</div>

  const E = withRoutes([
    { path: '/c', component: { e: () => C } },
    { path: '/d', component: { e: () => D } },
  ])(({ outlets }) => outlets.e || <div>e</div>)

  const testPath = createTestPath(<E/>)

  t.is(await testPath('/'), 'e')
  t.is(await testPath('/not-found'), 'e')
  t.is(await testPath('/c'), 'c')
  t.is(await testPath('/d'), 'd')
  t.is(await testPath('/d/e'), 'd')
  t.is(await testPath('/c/a'), 'a')
  t.is(await testPath('/c/a/b'), 'a')
  t.is(await testPath('/c/b'), 'b')
  t.is(await testPath('/c/not-found'), 'c')
})
