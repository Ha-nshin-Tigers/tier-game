# みんなでティア表

親が5つのワードを 1位〜5位 に並べ、ほかのプレイヤーが制限時間内にその並びを予想して得点を競うオンラインパーティーゲーム。
ログイン不要。ニックネームと部屋コードを入れるだけで遊べる。

## 構成

| ファイル | 役割 |
|---|---|
| `server.js` | ゲームサーバ(HTTP + WebSocket)。部屋・タイマー・得点計算・お題の保存 |
| `public/index.html` | 画面(入室・ゲーム・お題コレクション) |
| `render.yaml` | Render にデプロイするための設定 |

- 親の答えはサーバだけが持ち、答え合わせまでほかのプレイヤーには送らない
- 部屋のデータはサーバのメモリ上にある(サーバが再起動すると進行中のゲームと得点は消える)
- 「みんなのお題」は Upstash Redis に保存(未設定ならローカルの `data/topics.json`)

## 得点

- 順位がぴったり: 3点
- 1つずれ: 1点
- 5つ全部ぴったり: ボーナス5点

## 手元で動かす

Node.js 18 以上が必要。

```bash
npm install
npm start
```

http://localhost:3000 を開く。

## Render に公開する

1. このフォルダを GitHub のリポジトリに push する
2. https://render.com に GitHub アカウントでログイン
3. 「New +」→「Blueprint」→ リポジトリを選ぶ(`render.yaml` が読み込まれる)
4. 「Apply」でデプロイ。数分で `https://tier-game-xxxx.onrender.com` のような URL ができる

無料プランは15分ほど誰も使わないと休止し、次の接続で起動するまで30秒〜1分かかる。

## お題をずっと残す(Upstash Redis)

Render 無料プランではサーバのファイルが再起動で消えるため、お題は外部に保存する。

1. https://upstash.com に登録(無料)し、Redis データベースを作る
2. データベース画面の「REST API」にある `UPSTASH_REDIS_REST_URL` と `UPSTASH_REDIS_REST_TOKEN` をコピー
3. Render のサービス画面 →「Environment」に2つを設定して保存(自動で再デプロイされる)

設定しなくてもゲームは遊べるが、お題はサーバの再起動のたびに消える。
