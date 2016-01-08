import path from 'path';
import { each } from 'lodash';
import React from 'react';
import ReactDOM from 'react-dom/server';
import { RouterContext, match } from 'react-router';
import PrettyError from 'pretty-error';
import createMemoryHistory from 'react-router/lib/createMemoryHistory';
import { Provider } from 'react-redux';

import createStore from '../shared/create';
import Html from '../containers/HtmlShell/HtmlShell';

export default (config, tools) => {

  const getRoutes = require(path.resolve(config.routes)).default;
  const reducers = require(path.resolve(config.redux.reducers)).default;
  const pretty = new PrettyError();

  let CustomHtml;
  if (config.htmlShell) {
    CustomHtml = require(path.resolve(config.htmlShell)).default;
  } else {
    CustomHtml = Html;
  }

  return (req, res) => {

    if (__DEVELOPMENT__) {
      // Do not cache webpack stats: the script file would change since
      // hot module replacement is enabled in the development env
      tools.refresh();
    }

    // assemble custom middleware, pass req, res
    const middleware = [];
    if (config.redux.middleware) {
      const customMiddleware = require(path.resolve(config.redux.middleware)).default;
      each(customMiddleware, (customMiddlewareToAdd) => {
        if (typeof customMiddlewareToAdd === 'function') {
          middleware.push(customMiddlewareToAdd(req, res));
        }
      });
    }

    const store = createStore(middleware, createMemoryHistory(), reducers);

    function hydrateOnClient() {
      res.send('<!doctype html>\n' + ReactDOM.renderToString(<CustomHtml assets={tools.assets()} store={store} headers={res._headers} />));
    }

    if (__DISABLE_SSR__) {
      hydrateOnClient();
      return;
    }

    match({ routes: getRoutes(),
            location: req.originalUrl }, (error, redirectLocation, renderProps) => {
      if (redirectLocation) {
        res.redirect(redirectLocation.pathname + redirectLocation.search);
      } else if (error) {
        console.error('ROUTER ERROR:', pretty.render(error));
        res.status(500);
        hydrateOnClient();
      } else if (renderProps) {
        const component = (
          <Provider store={store} key="provider">
            <RouterContext {...renderProps} />
          </Provider>
        );

        res.status(200);
        res.send('<!doctype html>\n' + ReactDOM.renderToString(<CustomHtml assets={tools.assets()} component={component} store={store} headers={res._headers} />));
      } else {
        res.status(404).send('Not found');
      }
    });
  };
};
