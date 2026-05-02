export default {
  mini: {
    enableSourceMap: false,
    sourceMapType: 'none',
    miniCssExtractPluginOption: {
      ignoreOrder: true,
    },
    webpackChain(chain) {
      chain.devtool(false)
      // 更激进的压缩：去掉 console/debugger，减少包体积
      chain.optimization.minimizer('terserPlugin').tap((args) => {
        if (args[0]?.terserOptions) {
          args[0].terserOptions.compress = {
            ...args[0].terserOptions.compress,
            drop_console: true,
            drop_debugger: true,
            pure_funcs: ['console.log', 'console.info', 'console.debug'],
          }
        }
        return args
      })
    },
  },
  h5: {
    enableSourceMap: false,
  },
}
