import {
  createElement,
  Component,
  ComponentClass,
  StatelessComponent,
  ChildContextProvider,
  ReactElement,
  PropTypes,
  ValidationMap,
  Children,
} from 'react'

import pathToRegexp = require('path-to-regexp')

/**
 * Convenience type which represents either a component class or a stateless
 * functional component.
 */
type ComponentType<P> = ComponentClass<P> | StatelessComponent<P>

/**
 * Any type that can be converted into a `Promise` with `Promise.resolve`.
 * Includes raw types, thenables, and promises.
 */
type IntoPromise<T> = T | Promise<T>

/**
 * Users define route handlers in a slightly different way then what the
 * library needs. This is the user facing type.
 *
 * We require components to be wrapped in a thunk because we can’t tell the
 * difference between a thunk and a stateless functional component. They are
 * both functions and the stateless functional component doesn’t require any
 * extra properties.
 *
 * The handler can either be a single thunk, or a map of
 */
export type UserRouteHandler = {
  path: string,
  end?: boolean,
  component: (() => IntoPromise<ComponentType<any>>) | {
    [key: string]: () => IntoPromise<ComponentType<any>>,
  },
}

/**
 * The internal route handler type. Has a path RegExp for testing paths and a
 * component thunk which returns a promise of a component.
 *
 * We want the component to be promised to allow for code splitting. If a
 * component must be dynamically loaded, the component thunk needs to be async.
 */
type RouteHandler = {
  pathRegExp: pathToRegexp.PathRegExp,
  getComponents: () => Promise<{ [key: string]: ComponentType<any> }>,
}

/**
 * Converts a public facing `UserRouteHandler` to an internal `RouteHandler`.
 */
export function toRouteHandler ({ path, end, component }: UserRouteHandler): RouteHandler {
  return {
    pathRegExp: pathToRegexp(path, {
      // If `end` is a boolean, use it as the `end` option for `pathToRegexp`.
      // If `end` is not a boolean (which likely means it is undefined) then
      // *most* of the time we don’t want to end therefore the value is false.
      // However, if the path is exactly `/` we set `end` to true as a
      // convenience.
      end: typeof end === 'boolean' ? end : path === '/',
    }),
    getComponents: () => {
      // If the component is a thunk then it is a single default component.
      if (typeof component === 'function') {
        return Promise.resolve(component()).then(defaultComponent => ({ default: defaultComponent }))
      }
      // Otherwise we need to convert our thunk promised component map into a
      // promised component map.
      else {
        // Get the keys for our thunk component map.
        const keys = Object.keys(component)
        // Convert all of our thunks into promises.
        const componentsPromise = Promise.all(keys.map(key => Promise.resolve(component[key]())))
        // Convert our components array into a components map.
        return componentsPromise.then(components => {
          const componentsMap = {}
          keys.forEach((key, i) => componentsMap[key] = components[i])
          return componentsMap
        })
      }
    },
  }
}

/**
 * The props that the `PathProvider` will provide to all children via the
 * context. Just a simple path string.
 */
export type PathProviderData = {
  path: string,
}

/**
 * A component which just exposes some data through its context. It expects a
 * single child only.
 */
export class PathProvider
  extends Component<PathProviderData, {}>
  implements ChildContextProvider<PathProviderData> {

  static propTypes: ValidationMap<PathProviderData> = { path: PropTypes.string.isRequired }
  static childContextTypes: ValidationMap<PathProviderData> = { path: PropTypes.string.isRequired }

  getChildContext () {
    return { path: this.props.path }
  }

  render () {
    const { children } = this.props
    if (!children) throw new Error('<PathProvider> must have children.')
    else return Children.only(children)
  }
}

/**
 * Wraps an element in a `PathProvider` with the given prop. With this we
 * easily provide the new path to child elements.
 */
function providePath (path: string, element: ReactElement<any>) {
  return createElement(PathProvider, { path }, element)
}

/**
 * The outlet object we provide to the `RouteOutlet`’s component is either an
 * element or a plain object with some extra properties. Those extra properties
 * being named outlets.
 */
type Outlets = {
  [key: string]: ReactElement<any>,
}

/**
 * A type that represents the state of the route outlet at any given time. Just
 * a single React element ultimately.
 */
type RouteOutletState = {
  outlets: Outlets,
}

/**
 * The meat and potatoes of this library. A component enhancer which will use a
 * selected child for a given path in the context.
 *
 * Takes `UserRouteHandler`s as the first curried parameter.
 */
export const withRoutes =
  <P>(userRouteHandlers: UserRouteHandler[]) => (component: ComponentType<P & RouteOutletState>): ComponentClass<P> =>
    class RouteOutlet extends Component<P, RouteOutletState> {
      static contextTypes: ValidationMap<PathProviderData> = { path: PropTypes.string.isRequired }
      static routeHandlers: RouteHandler[] = userRouteHandlers.map(toRouteHandler)

      state: RouteOutletState = { outlets: {} }
      context: PathProviderData
      currentZoneID = 0

      componentDidMount () {
        // Compute the outlet once we know the component mounted. Note that
        // this library does not support server side rendering because
        // component loading will always be inherently asynchronous and server
        // side rendering will always be synchronous (in React at least).
        this.computeOutlet(this.context.path)
      }

      componentWillReceiveProps (nextProps: any, nextContext: PathProviderData) {
        // Compute the outlet when the context changes.
        this.computeOutlet(nextContext.path)
      }

      computeOutlet (path: string) {
        // Because this operation is async, we need to keep track of this
        // function’s zone so we don’t end up undoing a later action. A more
        // ideal solution would be to use `Promise` cancellation, but that
        // doesn’t exist at the time of this writing.
        const zoneID = this.currentZoneID += 1
        // Get all our route handlers which is a static property on the
        // `RouteOutlet` component.
        const { routeHandlers } = RouteOutlet
        // Find our route handler by testing our `path` string.
        const routeHandler = routeHandlers.find(({ pathRegExp }) => pathRegExp.test(path))
        // If no route handler was found, the outlet will be empty.
        if (!routeHandler) return this.setState({ outlets: {} })
        // Call our thunk…
        routeHandler.getComponents()
        .then(components => {
          // If we are in a different zone, noop.
          if (zoneID !== this.currentZoneID) return
          // Execute our regular expression to get our matches. We can safely
          // cast here because we ran `test` before so we know it’s a match.
          const [match, ...matches] = routeHandler.pathRegExp.exec(path) as RegExpExecArray
          // In order to get what’s left in the path, slice from where our
          // match ended, to the end of the string.
          const pathRest = path.slice(match.length)
          // Iterate through all of our matches and add that key to our `params`
          // object. The `params` object will then be the props for our outlet.
          const params = {}
          matches.forEach((match, i) => params[routeHandler.pathRegExp.keys[i].name] = match)
          // Create our outlet and then populate it’s keys.
          const outlets: Outlets = {}
          // Add all of our other outlets to the outlet object. Note how every
          // element we created, we also made sure to call `providePath`. This
          // way the children will only get the path that is left.
          Object.keys(components).forEach(key => {
            outlets[key] = providePath(pathRest, createElement(components[key], params))
          })
          // Set our default outlet to state.
          this.setState({ outlets })
        })
        .catch(error => {
          // Report the error, but otherwise we can’t do anything.
          console.error(error.stack)
          // If we are in a different zone, noop.
          if (zoneID !== this.currentZoneID) return
          this.setState({ outlets: {} })
        })
      }

      render () {
        // Render the element we our composing. Add our outlet prop to the
        // props that got passed into us, and if we have a default outlet
        // value, pass it as children.
        const { outlets } = this.state
        const props = Object.assign({}, this.props, { outlets })
        return createElement(
          component,
          props,
          outlets['default']
        )
      }
    }

export default withRoutes
