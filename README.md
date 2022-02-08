# Twitch - Twitter connection tool

本ツールはTwitchの配信状況に応じて自動でTwitterにpostするツールです。

## 準備物

### インストール関連
- Node.JS v14.x系で確認(最低でも10.x系以上)
- node-fetch v2.x系のみ動作(v3.x系では動きません)
- log4js 最新
- ajv v8.x以上
- ajv-i18n 最新
- 上記に付随するモジュール

### 認証関連
- TwitchアプリケーションのClientIDおよびClientSecret
- TwitterアプリケーションのAPI KeyおよびSecret
- TwitterのAccess TokenおよびSecret

## 設定

settings.jsonを必要な情報に変更してください。

## ライセンス

本ツールはMIT Licenseです。