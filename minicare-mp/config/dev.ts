export default {
  logger: {
    quiet: false,
    stats: true,
  },
  mini: {},
  h5: {
    devServer: {
      client: {
        // 仅 error 弹浮层；Sass @import 弃用等 warning 不遮蔽页面
        overlay: {
          errors: true,
          warnings: false,
        },
      },
    },
  },
}
