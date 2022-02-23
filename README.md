# Twitch - Twitter connection tool

本ツールはTwitchの配信状況に応じて自動でTwitterにpostするツールです。

## 準備物

### インストール関連
- Node.JS v14.x系で確認(最低でも10.x系以上)
- node-fetch v2.x系のみ動作(v3.x系では動きません)
- Twitter-API-V2 最新
- log4js 最新
- ajv v8.x以上
- ajv-i18n 最新
- 上記に付随するモジュール

### 認証関連
- TwitchアプリケーションのClientIDおよびClientSecret
- TwitterアプリケーションのAPI KeyおよびSecret
- TwitterのAccess TokenおよびSecret

## 導入手順

以下のリンクを参照してください。
https://note.com/siroirukan/n/n1bec250f8b92

## 設定

settings.jsonを必要な情報に変更してください。

## 実行方法

node TwitchStartPost.js
※ディレクトリ指定は任意で

## ライセンス

本ツールはMIT Licenseです。