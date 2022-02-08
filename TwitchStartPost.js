// 基本的な呼び出し
const settings = require('./settings.json');
const fetch = require("node-fetch");
const { TwitterApi } = require('twitter-api-v2');
const { URLSearchParams } = require('url');
const fsf = require('fs');
var log4js = require("log4js");

// settings.jsonのバリデーションチェック用
const Ajv = require("ajv");
const localize = require("ajv-i18n");
const ajv = new Ajv();
const schema = require('./schema.json');

// パラメータ初期化
var tgame_name = "";
var ttitle = "";
var postvalue = {};
var streamstatus = "";
var i = false;
var twitchbody = {
    data: [],
    pagination: {}
};

/**
 * ウェイト関数
 * @param milliSeconds 待ち時間(msec)
 */
const sleep = (milliSeconds) => new Promise(resolve => {
    setTimeout(() => resolve(), milliSeconds);
});

//Twitch認証サーバーにアクセストークンをもらいに行く関数
async function authTwitch(options) {
    const response = await fetch('https://id.twitch.tv/oauth2/token', {
        method: 'POST',
        body: options
    }).catch((err) => {
        // Twitchサーバー自体に接続できなかった場合のエラーハンドル
        logger.error("Twitch認証サーバーへのネットワーク接続に失敗した可能性があります。");
        throw new Error(err);
    });
    // Twitchサーバーには接続できたが、認証に失敗したか応答がなかったかのエラーハンドル
    if (!response.ok) {
        logger.error("Twitchの認証に失敗したか、サーバーが応答しませんでした。");
        logger.error("HTTP ERROR:" + response.status);
        logger.error("メッセージ:" + response.statusText);
        throw new Error(response.statusText);
    };
    tabody = await response.json();
    // なんらかの理由でTwitchサーバーからアクセストークンが帰ってこなかった場合のエラーハンドル
    if (!tabody.access_token) {
        logger.error("Twitchの認証に失敗しました。");
        throw new Error(tabody);
    }
    return tabody;
}

// Twitchから配信情報を取得する関数
const gameRequest = async (accessToken) => {
    // 以下のAPIから配信中の情報を取得する
    // https://dev.twitch.tv/docs/api/reference#get-streams
    const url = "https://api.twitch.tv/helix/streams?user_login=" + settings.General.twitchuser;
    const GameParams = new URLSearchParams();
    GameParams.append('Client-ID', settings.TwitchAuth.client_id);
    GameParams.append('Authorization', 'Bearer ' + accessToken);
    // 大丈夫だと思うけど、念のため直前でアクセストークンがあるか確認
    if (!accessToken) {
        logger.error("Twitchのトークンが取得できませんでした。");
        logger.error("Twitchの接続情報を確認してください。");
    } else {
        // Twitchサーバーに配信情報を取得
        GameResponse = await fetch(url, {
            method: 'GET',
            headers: GameParams
        }).catch((err) => {
            // Twitchサーバー自体に接続できなかった場合のエラーハンドル
            logger.error("Twitchサーバーへのネットワーク接続に失敗した可能性があります。");
            throw new Error(err);
        });
        // Twitchサーバーには接続できたが、認証に失敗したか応答がなかったかのエラーハンドル
        if (!GameResponse.ok) {
            logger.error("Twitchのサーバーが応答しませんでした。");
            logger.error("HTTP ERROR:" + GameResponse.status);
            logger.error("メッセージ:" + GameResponse.statusText);
            throw new Error(GameResponse.statusText);
        };
        Resbody = await GameResponse.json();
        if (Object.keys(Resbody.data).length) {
            logger.trace("Twitch配信情報表示");
            logger.trace(Resbody);
            return Resbody;
        } else {
            logger.trace(settings.General.twitchuser + "は現在配信していません。");
            logger.trace(settings.General.intervalMs / 1000 + "秒後に再確認します。");
            return Resbody;
        };
    };
}

// Twitter用Post内容の変数変換
function PostValueEx(str) {
    tmp = str.replace('{twitchuser}', settings.General.twitchuser);
    if (Object.keys(twitchbody.data).length) {
        tmp = tmp.replace('{title}', twitchbody.data[0].title);
        tmp = tmp.replace('{gamename}', twitchbody.data[0].game_name);
    }
    return tmp.replace('{twitchURL}', "https://twitch.tv/" + settings.General.twitchuser + "/");
}

//Twitterに投稿する関数
async function posttweet(rClient, mode, pv) {
    try {
        const { data: createdTweet } = await rClient.v2.tweet(pv);
        logger.trace('Tweet:', createdTweet.id, ':', createdTweet.text);
        switch (mode) {
            case "start":
                logger.trace("Twitterに配信開始を投稿成功");
                ParentTID = createdTweet.id;
                break;
            case "change":
                logger.trace("Twitterに配信内容変更を投稿成功");
                break;
            case "end":
                logger.trace("Twitterに配信終了を投稿成功");
                break;
            default:
                logger.warn("Twitterに投稿はされましたが、ログ上はどのステータスが判別できませんでした。")
                break;
        }
    } catch (error) {
        logger.error("Twitterへの投稿に失敗");
        logger.error(error.code + ":" + error.title);
        logger.error(error.detail);
        logger.error(error.errors.message);
        logger.error(error.type);
    }
}



// 監視ロジック
const wait = async (options, roClient) => {
    try {
        var TwitchTokenDate = 0;
        // Twitchの配信情報が取得出来るか、試行回数を越えたらループ終了
        while (true) {
            if (i) {
                const talkInSleep = await sleep(settings.General.intervalMs);
            };

            // Twitchサーバーへの認証開始
            // expires_inがだいぶ長い(60日くらい)ので無理に新しいトークンを取りに行かないようにする(30分切ったら取りに行く)
            // appでのアクセストークンはリフレッシュが出来ないので更新ではなく新しく取得
            var tmpdate = new Date().getTime();
            if (TwitchTokenDate == 0) {
                body = await authTwitch(options);
                logger.trace("Twitchのアクセストークン取得成功")
                var TwitchTokenDate = new Date().getTime();
            } else if (body.expires_in - parseInt(tmpdate / 1000) / 60 - parseInt(TwitchTokenDate / 1000) / 60 < 30) {
                body = await authTwitch(options);
                var TwitchTokenDate = new Date().getTime();
                logger.trace("Twitchのアクセストークン更新成功")
            }
            // Twitchサーバーへの認証終了

            // ここからTwitchサーバーに配信先の状態を確認し、Twitterに投稿する
            twitchbody = await gameRequest(body.access_token);
            if (!Object.keys(twitchbody.data).length) {
                if (tgame_name == "") {
                    // Twitch配信前の状態
                    // console.log("配信開始前");
                } else {
                    // 配信されていたTwitchの情報が取れなくなった=終了した状態
                    if (streamstatus == "live" && settings.TwitterPostSettings.endpost) {
                        postval = PostValueEx(settings.TwitterPostValue.StreamEnd);
                        if (!settings.Test.testmode) {
                            if (settings.TwitterPostSettings.endposttree) {
                                postvalue = {
                                    text: postval,
                                    reply: { in_reply_to_tweet_id: ParentTID }
                                }
                            } else {
                                postvalue = {
                                    text: postval
                                }
                            };
                            await posttweet(roClient, "end", postvalue);
                            //const { data: createdTweet } = await roClient.v2.tweet(postvalue);
                            //logger.trace("Twitterに配信終了を投稿成功");
                            //logger.trace('Tweet:', createdTweet.id, ':', createdTweet.text);
                        } else {
                            logger.trace("[テストモード]配信終了投稿内容: " + postval);
                        }
                    }
                    // 次の開始用にパラメータを初期化
                    twitchbody = {
                        data: [],
                        pagination: {}
                    };
                    ParentTID = 0;
                    postvalue = {};
                    streamstatus = "end";
                    tgame_name = "";
                    ttitle = "";
                    logger.trace("配信終了");
                }
            } else {
                if (!tgame_name.length) {
                    //Twitchの配信情報が取得出来た状態
                    postval = PostValueEx(settings.TwitterPostValue.StreamStart);
                    postvalue = { text: postval };

                    if (!settings.Test.testmode) {
                        await posttweet(roClient, "start", postvalue);
                        //const { data: createdTweet } = await roClient.v2.tweet(postvalue);
                        //logger.trace("Twitterに配信開始を投稿成功");
                        //logger.trace('Tweet:', createdTweet.id, ':', createdTweet.text);
                        //ParentTID = createdTweet.id;
                    } else {
                        logger.trace("[テストモード]配信開始投稿内容: " + postval);
                    }
                    tgame_name = twitchbody.data[0].game_name;
                    ttitle = twitchbody.data[0].title;
                    streamstatus = "live";
                } else {
                    //Twitchの配信情報の変更が確認された状態
                    if ((twitchbody.data[0].game_name != tgame_name) || (twitchbody.data[0].title != ttitle)) {
                        postval = PostValueEx(settings.TwitterPostValue.StreamChange);
                        if (!settings.Test.testmode) {
                            if (settings.TwitterPostSettings.replyposttree) {
                                postvalue = {
                                    text: postval,
                                    reply: { in_reply_to_tweet_id: ParentTID }
                                }
                            } else {
                                postvalue = {
                                    text: postval
                                }
                            };
                            await posttweet(roClient, "change", postvalue);
                            //const { data: createdTweet } = await roClient.v2.tweet(postvalue);
                            //logger.trace("Twitterに配信内容変更を投稿成功");
                            //logger.trace('Tweet:', createdTweet.id, ':', createdTweet.text);
                        } else {
                            logger.trace("[テストモード]配信内容変更を投稿内容: " + postval);
                        }
                        tgame_name = twitchbody.data[0].game_name;
                        ttitle = twitchbody.data[0].title;
                    } else {
                        logger.trace("配信維持");
                    }
                }
            }
            i = true;
        }
    } catch (e) {
        console.log(e.message);
    }
}

try {
    // ログファイル書き出し用フォルダの存在確認
    if (!fsf.existsSync('./logs')) {
        fsf.mkdirSync('./logs');
    }
    // ログファイル名生成用
    var now = new Date();
    var Year = now.getFullYear();
    var Month = ("0" + (now.getMonth() + 1)).slice(-2);
    var DDate = ("0" + (now.getDate())).slice(-2);
    var Hour = ("0" + (now.getHours())).slice(-2);
    var Min = ("0" + (now.getMinutes())).slice(-2);
    var Sec = ("0" + (now.getSeconds())).slice(-2);
    logname = "./logs/" + Year + Month + DDate + Hour + Min + Sec + ".log";

    log4js.configure({
        appenders: {
            out: {
                type: "stdout",
                layout: {
                    type: "pattern",
                    pattern: '%d{yyyy/MM/dd hh:mm:ss} %5p : %m'
                },
            },
            file: {
                type: "file",
                filename: logname,
                layout: {
                    type: "pattern",
                    pattern: '%d{yyyy/MM/dd hh:mm:ss} %5p : %m'
                },
            }
        },
        categories: {
            default: {
                appenders: ["out", "file"],
                level: "all"
            }
        }
    })
    var logger = log4js.getLogger();

    // settings.jsonの記載が間違っていないかチェック
    const validate = ajv.compile(schema);
    const valid = validate(settings);
    if (!valid) {
        //間違っていたらエラーを吐いて終了
        localize.ja(validate.errors);
        logger.error(ajv.errorsText(validate.errors, { separator: '\n' }))
    } else {

        // Twitchの認証情報
        const Authparams = new URLSearchParams();
        Authparams.append('client_id', settings.TwitchAuth.client_id);
        Authparams.append('client_secret', settings.TwitchAuth.client_secret);
        Authparams.append('grant_type', "client_credentials");

        // Twitterの認証情報
        const twitterClient = new TwitterApi({
            appKey: settings.TwitterAuth.appKey,
            appSecret: settings.TwitterAuth.appSecret,
            accessToken: settings.TwitterAuth.accessToken,
            accessSecret: settings.TwitterAuth.accessSecret,
        });

        const roClient = twitterClient.readOnly;

        if (settings.Test.testmode) {
            logger.trace("** テストモードで動作中です。Twitterに投稿されません。 **");
        }
        logger.trace("Monitoring TwitchID:" + settings.General.twitchuser);
        logger.trace("監視開始\n");
        wait(Authparams, roClient);
    }
} catch (e) {
    logger.error(e.message);
    log4js.shutdown;
}