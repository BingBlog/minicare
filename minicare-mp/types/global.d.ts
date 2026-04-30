/// <reference types="@tarojs/taro" />

declare module '*.png'
declare module '*.gif'
declare module '*.jpg'
declare module '*.jpeg'
declare module '*.svg' {
  const src: string
  export default src
}
declare module '*.css'
declare module '*.less'
declare module '*.scss'
declare module '*.sass'
declare module '*.styl'

declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV: 'development' | 'production'
    TARO_ENV:
      | 'weapp'
      | 'swan'
      | 'alipay'
      | 'h5'
      | 'rn'
      | 'tt'
      | 'qq'
      | 'jd'
      | 'harmony'
      | 'jdrn'
    /** 可通过 env 配置小程序 AppID，详见 Taro 环境变量文档 */
    TARO_APP_ID?: string
  }
}
