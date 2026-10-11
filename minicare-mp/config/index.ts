import { defineConfig, type UserConfigExport } from '@tarojs/cli'
import TsconfigPathsPlugin from 'tsconfig-paths-webpack-plugin'
import devConfig from './dev'
import prodConfig from './prod'

// https://docs.taro.zone/docs/config-detail
export default defineConfig<'webpack5'>(async (merge) => {
  const baseConfig: UserConfigExport<'webpack5'> = {
    projectName: 'minicare-mp',
    date: '2026-4-29',
    designWidth: 750,
    deviceRatio: {
      640: 2.34 / 2,
      750: 1,
      375: 2,
      828: 1.81 / 2,
    },
    sourceRoot: 'src',
    // 双端产物隔离：H5 输出到 dist-h5，避免覆盖 weapp 的 dist（微信开发者工具正在 watch）
    outputRoot: process.env.TARO_ENV === 'h5' ? 'dist-h5' : 'dist',
    plugins: ['@tarojs/plugin-generator'],
    defineConstants: {},
    copy: {
      patterns:
        process.env.TARO_ENV === 'h5'
          ? []
          : [
              // 提示音仅小程序端使用（语音输入），H5 无需拷贝
              { from: 'src/assets/sounds/', to: 'dist/assets/sounds/', ignore: ['.*'] },
            ],
      options: {},
    },
    framework: 'react',
    compiler: {
      type: 'webpack5',
      prebundle: {
        exclude: ['echarts', 'echarts/core', 'echarts/charts', 'echarts/components', 'echarts/renderers', '@cloudbase/app', '@cloudbase/auth'],
      },
    },
    cache: {
      enable: false,
    },
    mini: {
      miniCssExtractPluginOption: {
        ignoreOrder: true,
      },
      postcss: {
        pxtransform: {
          enable: false,
          config: {},
        },
        cssModules: {
          enable: false,
          config: {
            namingPattern: 'module',
            generateScopedName: '[name]__[local]___[hash:base64:5]',
          },
        },
      },
      webpackChain(chain) {
        chain.resolve.plugin('tsconfig-paths').use(TsconfigPathsPlugin)
        // 让 babel-loader 也编译包含 ES2020+ 语法的 node_modules 包
        // @cloudbase SDK 和 bson 发布时未降级 ?./?? 语法
        chain.module.rule('script').include.add(/[\\/]node_modules[\\/](@cloudbase|bson)[\\/]/)
      },
    },
    h5: {
      // 子路径部署支持：staging 构建由 .env.staging 提供 TARO_APP_H5_BASE_PATH=/staging/
      // （web 替换后 staging 产物部署在 CloudBase 静态托管 /staging/；prod/dev 不设该变量，默认 '/'）
      publicPath: process.env.TARO_APP_H5_BASE_PATH || '/',
      staticDirectory: 'static',
      output: {
        filename: 'js/[name].[hash:8].js',
        chunkFilename: 'js/[name].[chunkhash:8].js',
      },
      miniCssExtractPluginOption: {
        ignoreOrder: true,
        filename: 'css/[name].[hash].css',
        chunkFilename: 'css/[name].[chunkhash].css',
      },
      postcss: {
        autoprefixer: {
          enable: true,
          config: {},
        },
        cssModules: {
          enable: false,
          config: {
            namingPattern: 'module',
            generateScopedName: '[name]__[local]___[hash:base64:5]',
          },
        },
      },
      webpackChain(chain) {
        chain.resolve.plugin('tsconfig-paths').use(TsconfigPathsPlugin)
      },
    },
    rn: {
      appName: 'minicareMp',
      postcss: {
        cssModules: {
          enable: false,
        },
      },
    },
  }

  if (process.env.NODE_ENV === 'development') {
    return merge({}, baseConfig, devConfig)
  }
  return merge({}, baseConfig, prodConfig)
})
