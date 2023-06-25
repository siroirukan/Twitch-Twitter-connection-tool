// 基本的な呼び出し
const settings = require('./settings.json');
const twimages = require('./tweetimages.json');
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
var retry = 0
const maxretry = 3
var streamstart = 0;
var cyclecount = 1;
var StreamStart = settings.TwitterPostValue.StreamStart
var replyposttree = settings.TwitterPostSettings.replyposttree
var endposttree = settings.TwitterPostSettings.endposttree
var postretry = 0;
var maxpostretry = 3;


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
        const message = 'Twitch認証サーバーへのネットワーク接続に失敗した可能性があります。\n設定およびネットワークを確認してください。'
        async () => { await DiscordAlert(message) }
        throw new Error(err);
    });
    // Twitchサーバーには接続できたが、認証に失敗したか応答がなかったかのエラーハンドル
    if (!response.ok) {
        logger.error("Twitchの認証に失敗したか、サーバーが応答しませんでした。");
        logger.error(`HTTP ERROR: ${response.status}`);
        logger.error(`メッセージ: ${response.statusText}`);
        const message = 'Twitchの認証に失敗したか、サーバーが応答しませんでした。\n設定およびTwitchサーバーに障害が発生していないか確認してください。'
        async () => { await DiscordAlert(message) }
        throw new Error(response.statusText);
    };
    tabody = await response.json();
    // なんらかの理由でTwitchサーバーからアクセストークンが帰ってこなかった場合のエラーハンドル
    if (!tabody.access_token) {
        logger.error("Twitchの認証に失敗しました。");
        const message = 'Twitchの認証に失敗しました。\n設定を確認してください。'
        async () => { await DiscordAlert(message) }
        throw new Error(tabody);
    }
    return tabody;
}

// Twitchから配信情報を取得する関数
const gameRequest = async (accessToken) => {
    // 以下のAPIから配信中の情報を取得する
    // https://dev.twitch.tv/docs/api/reference#get-streams
    const url = `https://api.twitch.tv/helix/streams?user_login=${settings.General.twitchuser}`;
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
            logger.trace(err);
            retry++;
        });
        // Twitchサーバーには接続できたが、認証に失敗したか応答がなかったかのエラーハンドル
        if (GameResponse != undefined) {
            if (!GameResponse.ok) {
                logger.error("Twitchのサーバーへのリクエストに失敗しました。");
                logger.error("HTTP ERROR: " + GameResponse.status);
                logger.error("URL: " + GameResponse.url);
                logger.error("メッセージ: " + GameResponse.statusText);
                retry++;
                logger.trace(`${settings.General.intervalMs / 1000}秒後に再接続します。(再試行${retry}回目)`);
                return null;
            } else {
                Resbody = await GameResponse.json();
                if (Object.keys(Resbody.data).length) {
                    retry = 0;
                    logger.trace("Twitch配信情報表示");
                    if (settings.Test.testmode) {
                        logger.trace(Resbody);
                    } else {
                        logger.trace(`\n----配信情報----\n配信ID:   ${Resbody.data[0].user_login}\n配信者名: ${Resbody.data[0].user_name}\nゲーム名: ${Resbody.data[0].game_name}\n配信名:   ${Resbody.data[0].title}\n視聴数:   ${Resbody.data[0].viewer_count}\nタグ:     ${Resbody.data[0].tags}\n成人指定: ${Resbody.data[0].is_mature}\n----------------`);
                    }
                    return Resbody;
                } else {
                    retry = 0;
                    logger.trace(`${settings.General.twitchuser}は現在配信していません。${settings.General.intervalMs / 1000}秒後に再確認します。`);
                    return Resbody;
                }
            }
        } else {
            logger.trace(`${settings.General.intervalMs / 1000}秒後に再接続します。(再試行${retry}回目)`);
            return null;
        }
    }
}

// Twitter用Post内容の変数変換
function PostValueEx(str, mode) {
    tmp = str.replace('{twitchuser}', settings.General.twitchuser);
    //配信終了後はデータが取れないので排除しておく
    if (Object.keys(twitchbody.data).length && mode != "end") {
        tmp = tmp.replace('{title}', twitchbody.data[0].title);
        tmp = tmp.replace('{gamename}', twitchbody.data[0].game_name);
        if (Math.floor(settings.TwitterPostSettings.repeatcycle * cyclecount / 60) == 0) {
            var cyclevalue = `${settings.TwitterPostSettings.repeatcycle * cyclecount}分`
        } else {
            if ((settings.TwitterPostSettings.repeatcycle * cyclecount) % 60 == 0) {
                var cyclevalue = `${settings.TwitterPostSettings.repeatcycle * cyclecount / 60}時間`
            } else {
                var cyclevalue = `${Math.floor(settings.TwitterPostSettings.repeatcycle * cyclecount / 60)}時間${(settings.TwitterPostSettings.repeatcycle * cyclecount) % 60}分`
            }
        }
        tmp = tmp.replace('{time}', cyclevalue);
    }
    if (settings.TwitterPostSettings.TwitterBlue) {
        return tmp.replace('{twitchURL}', `https://twitch.tv/${settings.General.twitchuser}/`).substr(0, 500);
    } else {
        return tmp.replace('{twitchURL}', `https://twitch.tv/${settings.General.twitchuser}/`).substr(0, 140);
    }
}

function mediaids_save(media_ids) {
    twimages.find(game => {
        if (game.category == twitchbody.data[0].game_name) {
            game.mediaids = media_ids
        }
    })

    const fs_wtwimages = require('fs');
    fs_wtwimages.writeFileSync('./tweetimages.json', JSON.stringify(twimages, null, 2));
}

//Twitterに投稿する関数
async function posttweet(rClient, mode, pv, twitchbody) {
    var imageflg = false;
    //配信終了連絡は画像を用いない
    if (mode != "end") {
        for (twi in twimages) {
            if (twitchbody.data[0].game_name == twimages[twi].category) {
                if (!twimages[twi].mediaids.length) {
                    const twchk = require('fs');
                    if (twchk.existsSync(twimages[twi].image)) {
                        var mediaIDs = await Promise.all([
                            // file path
                            rClient.v1.uploadMedia(twimages[twi].image)
                        ])
                        imageflg = true;
                    } else {
                        logger.trace("Twitter投稿用のファイルが存在しませんでした。");
                    }
                } else {
                    logger.trace('こちらに通った')
                    var mediaIDs = twimages[twi].mediaids;
                    imageflg = true;
                }
            }
        }
    }
    //logger.trace(rClient);
    if (imageflg) {
        //添付画像がある場合
        //logger.trace(mediaIDs);
        pv.media = { "media_ids": mediaIDs };
        logger.trace(pv);
        var { data: createdTweet } = await rClient.v2.tweet(pv)
            .catch((err) => {
                logger.error("Twitterへの投稿に失敗");
                logger.trace(err);
            });
        if (createdTweet != undefined) {
            mediaids_save(mediaIDs);
        }
    } else {
        //添付画像が無い場合
        var result = ''
        var { data: createdTweet } = await rClient.v2.tweet(pv)
            .catch((err) => {
                logger.error("Twitterへの投稿に失敗");
                //logger.trace(err);
                if (err.data.detail.indexOf('duplicate') > 0) {
                    logger.error('同一の内容が送信されたため、次回"_"を付与して再送します。')
                    StreamStart = `_${StreamStart}`
                    result = 'duplicate'
                } else {
                    if (err.data.detail.indexOf('deleted or not visible') > 0) {
                        logger.error('親ツリーが削除されたか閲覧できなくなっているためツリー表示を無効にしました。')
                        endposttree = false
                        replyposttree = false
                        result = 'deleted'
                    } else {
                        if (err.data.detail.indexOf('Unauthorized') > 0) {
                            postretry++
                            logger.error(`Twitter認証エラー(${postretry}回目)`)
                            result = 'unauthorized'
                        } else {
                            postretry++
                            logger.error(`Twitter不明なエラー(${postretry}回目)`)
                            result = 'other'
                        }
                    }
                }
                logger.error(err.data.detail)
                return ''
            });
    }
    if (createdTweet != undefined) {
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
            case "cycle":
                logger.trace("Twitterに定期通知を投稿成功");
                break;
            default:
                logger.warn("Twitterに投稿はされましたが、ログ上はどのステータスが判別できませんでした。")
                break;
        }
        postretry = 0;
        return 'Success'
    } else {
        return result
    }
}

const DiscordAlert = async (message) => {
    //Discord通知機能がオンなら起動
    if (settings.DiscordSettings.enable) {
        if (settings.DiscordSettings.mention) {
            var messagebody = {
                'username': settings.DiscordSettings.disp_username,
                'content': `<@${settings.DiscordSettings.alart_userID}>\n${message}`,
                'allowed_mentions': { "parse": ['users'] }
            }
        } else {
            var messagebody = {
                'username': settings.DiscordSettings.disp_username,
                'content': message,
                'allowed_mentions': { "parse": ['users'] }
            }
        }

        const response = await fetch(settings.DiscordSettings.WebhookURL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(messagebody)
        })

        if (response.status === 204) {
            logger.trace('Discordへの投稿に成功');
        } else {
            logger.trace('Discordへの投稿に失敗');
        }
    }
}



// 監視ロジック
const wait = async (options, roClient) => {
    try {
        var TwitchTokenDate = 0;
        // Twitchの配信情報が取得出来るか、試行回数を越えたらループ終了
        while (true) {
            if (postretry >= maxpostretry) {
                const message = 'Twitter投稿時に規定回数エラーが発生したため停止しました。\n設定または最新のログファイルを確認してください。'
                await DiscordAlert(message)
                throw new Error(`Twitterに連続して${postretry}回エラーとなったため強制終了しました。`)
            }
            if (i) {
                //指定秒待つ処理、他の処理で少し時間がかかるので少しだけマイナス
                const talkInSleep = await sleep(settings.General.intervalMs - 150);
            };

            // Twitchサーバーへの認証開始
            // expires_inがだいぶ長い(60日くらい)ので無理に新しいトークンを取りに行かないようにする(30分切ったら取りに行く)
            // appでのアクセストークンはリフレッシュが出来ないので更新ではなく新しく取得
            var tmpdate = new Date().getTime();
            if (TwitchTokenDate == 0) {
                body = await authTwitch(options);
                logger.trace("Twitchのアクセストークン取得成功")
                var TwitchTokenDate = new Date().getTime();
            } else if (body.expires_in - (parseInt(tmpdate / 1000) / 60 - parseInt(TwitchTokenDate / 1000) / 60) < 30) {
                body = await authTwitch(options);
                var TwitchTokenDate = new Date().getTime();
                logger.trace("Twitchのアクセストークン更新成功")
            }
            // Twitchサーバーへの認証終了

            // ここからTwitchサーバーに配信先の状態を確認し、Twitterに投稿する
            twitchbody = await gameRequest(body.access_token);
            if (twitchbody != null) {
                if (!Object.keys(twitchbody.data).length) {
                    if (tgame_name == "") {
                        // Twitch配信前の状態
                        // console.log("配信開始前");
                    } else {
                        // 配信されていたTwitchの情報が取れなくなった=終了した状態
                        if (streamstatus == "live" && settings.TwitterPostSettings.endpost) {
                            postval = PostValueEx(settings.TwitterPostValue.StreamEnd, "end");
                            if (!settings.Test.testmode) {
                                if (endposttree) {
                                    postvalue = {
                                        text: postval,
                                        reply: { in_reply_to_tweet_id: ParentTID }
                                    }
                                } else {
                                    postvalue = {
                                        text: postval
                                    }
                                };
                                await posttweet(roClient, "end", postvalue, twitchbody);
                            } else {
                                logger.trace(`[テストモード]配信終了投稿内容: ${postval}`);
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
                        postval = PostValueEx(StreamStart, "start");
                        postvalue = { text: postval };

                        if (!settings.Test.testmode) {
                            var startresult = await posttweet(roClient, "start", postvalue, twitchbody);
                            //const { data: createdTweet } = await roClient.v2.tweet(postvalue);
                            //logger.trace("Twitterに配信開始を投稿成功");
                            //logger.trace('Tweet:', createdTweet.id, ':', createdTweet.text);
                            //ParentTID = createdTweet.id;
                        } else {
                            logger.trace(`[テストモード]配信開始投稿内容: ${postval}`);
                        }
                        if (startresult == 'Success') {
                            tgame_name = twitchbody.data[0].game_name;
                            ttitle = twitchbody.data[0].title;
                            streamstatus = "live";
                            streamstart = Date.parse(twitchbody.data[0].started_at);
                        }

                        //streamstart = new Date(Date.now()).toUTCString()
                    } else {
                        //Twitchの配信情報の変更が確認された状態
                        if (((twitchbody.data[0].game_name != tgame_name) || (twitchbody.data[0].title != ttitle)) && (twitchbody.data[0].game_name != "Watch Parties")) {
                            postval = PostValueEx(settings.TwitterPostValue.StreamChange, "change");
                            if (!settings.Test.testmode) {
                                if (replyposttree) {
                                    postvalue = {
                                        text: postval,
                                        reply: { in_reply_to_tweet_id: ParentTID }
                                    }
                                } else {
                                    postvalue = {
                                        text: postval
                                    }
                                };
                                await posttweet(roClient, "change", postvalue, twitchbody);
                            } else {
                                logger.trace(`[テストモード]配信内容変更を投稿内容: ${postval}`);
                            }
                            tgame_name = twitchbody.data[0].game_name;
                            ttitle = twitchbody.data[0].title;
                        } else {
                            if (settings.TwitterPostSettings.repeatpost) {
                                //現在時刻が次の時間より大きければ通知処理へ
                                if (Date.now() >= streamstart + settings.TwitterPostSettings.repeatcycle * 60 * 1000) {
                                    //開始時間と現在時刻に大きく乖離がある場合、一気にサイクルを進めて調整する
                                    while (Date.now() >= streamstart + settings.TwitterPostSettings.repeatcycle * 2 * 60 * 1000) {
                                        streamstart = streamstart + settings.TwitterPostSettings.repeatcycle * 60 * 1000;
                                        cyclecount++;
                                    }
                                    postval = PostValueEx(settings.TwitterPostValue.StreamCycle, "live");
                                    if (!settings.Test.testmode) {
                                        postvalue = {
                                            text: postval
                                        }
                                        await posttweet(roClient, "cycle", postvalue, twitchbody);
                                        streamstart = streamstart + settings.TwitterPostSettings.repeatcycle * 60 * 1000;
                                        cyclecount++;
                                    } else {
                                        logger.trace(`[テストモード]定期通知を投稿内容: ${postval}`);
                                        streamstart = streamstart + settings.TwitterPostSettings.repeatcycle * 60 * 1000;
                                        cyclecount++;
                                    }
                                } else {
                                    logger.trace("配信維持");
                                }
                            } else {
                                logger.trace("配信維持");
                            }
                        }
                    }
                }
            } else {
                if (retry == maxretry) {
                    const message = 'Twitch接続時に規定回数エラーが発生したため停止しました。\n設定または最新のログファイルを確認してください。'
                    await DiscordAlert(message)
                    throw new Error(`Twitchに連続して${retry}回エラーとなったため強制終了しました。`)
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
        logger.trace(`Monitoring TwitchID: ${settings.General.twitchuser}`);
        logger.trace("監視開始\n");
        wait(Authparams, roClient);
    }
} catch (e) {
    logger.error(e.message);
    log4js.shutdown;
}