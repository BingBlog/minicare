export default {
  logger: {
    quiet: false,
    stats: true,
  },
  mini: {},
  h5: {
    devServer: {
      // 绑 0.0.0.0：手机上用局域网 IP（如 http://192.168.1.16:10086）访问 dev:h5
      host: '0.0.0.0',
      client: {
        // 仅 error 弹浮层；Sass @import 弃用等 warning 不遮蔽页面
        overlay: {
          errors: true,
          warnings: false,
        },
      },
      // H5 dev 下 API 走同源相对路径（见 src/api/base.ts），由这里转发到本机后端，
      // 解决手机访问时 127.0.0.1 指向手机自身导致连不上 3001 的问题
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:3001',
          changeOrigin: false,
        },
      },
    },
  },
}
