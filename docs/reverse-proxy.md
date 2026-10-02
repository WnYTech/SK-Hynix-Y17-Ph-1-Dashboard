# Y17 리버스 프록시 적용

2026-10-02 확인 기준입니다. 이 문서와 nginx 파일은 적용할 설정안이며 원격 nginx에는 아직 설치하지 않았습니다. 현재 `sy_jin@192.168.100.116` SSH 인증이 거절되어 원격 설정 파일 확인·`nginx -t`·reload는 실행하지 못했습니다. 앱과 프런트 서버의 시작·종료도 사용자가 직접 수행합니다.

## 도메인과 연결 경로

| 용도                     | 값                                                                |
| ------------------------ | ----------------------------------------------------------------- |
| 등록된 DNS               | `y17_ph-1.wnytech.co.kr` → `1.233.140.212`, A / TTL 300           |
| 권장 HTTPS 이름 / 설정안 | `y17-ph-1.wnytech.co.kr`                                          |
| nginx 서버               | `192.168.100.116`                                                 |
| 실제 앱 서버             | `192.168.200.254`                                                 |
| 앱 포트                  | `8017`, React 빌드와 `/api` 공통                                  |
| 인증서                   | `/etc/letsencrypt/live/wnytech.co.kr/{fullchain.pem,privkey.pem}` |

밑줄 이름은 DNS 조회에 성공했지만 현재 서버가 제시하는 `*.wnytech.co.kr` 인증서의 호스트명 검증에 실패했습니다. 동일한 인증서를 하이픈 이름으로 검증하면 통과합니다. 인증서 SAN은 `*.wnytech.co.kr`, `wnytech.co.kr`이며 확인 당시 만료일은 2026-12-21입니다. 기존 Route 53 레코드는 수정하지 않았습니다. 설정안은 하이픈 이름을 사용하므로 먼저 이 이름의 A 레코드를 `1.233.140.212`, TTL 300으로 추가하거나 기존 이름을 수정하세요. 밑줄 URL에 HTTPS 리다이렉트만 추가해도 리다이렉트 전에 TLS 검증이 이루어지므로 이 문제를 해결하지 못합니다.

접속 경로는 `브라우저 HTTPS → 공인 IP → nginx 192.168.100.116 → 앱 192.168.200.254:8017`입니다. 예시 WeshBoard 서버 `192.168.100.141:8000`을 Y17 대상으로 사용하지 않습니다.

## 1. 앱 서버에서 실행

`192.168.200.254`의 프로젝트 디렉토리에서 실행합니다.

```bash
cd /home/sy_jin/SK-Hynix-Y17-Ph-1-Dashboard
npm run build
```

기존 `127.0.0.1:8017` API가 실행 중인 터미널에서 직접 `Ctrl+C`로 종료한 뒤 다음을 실행합니다. 실행 터미널은 유지합니다.

```bash
python3 app.py --production --host 192.168.200.254 --proxy-ips 192.168.100.116
```

`--production`은 빌드가 없으면 실행을 중단하고 빌드 명령을 안내합니다. React 정적 파일은 `frontend/dist`에서만 제공하고 `/api`는 기존 FastAPI가 처리합니다. 더미 DB·소스 파일은 정적 루트 밖에 있습니다. UI는 기존 해시 라우팅을 그대로 사용합니다. API에서 프록시 헤더를 신뢰하는 주소는 지정한 nginx IP로 제한합니다.

도메인 접속은 이 프로세스 하나를 사용합니다. 기존 로컬 개발 방식(`python3 app.py`, `npm run dev`)도 유지됩니다. 서버 재시작이 필요한 모드이므로 자동으로 현재 프로세스를 중단하거나 전환하지 않습니다.

## 2. nginx 서버에 설정 파일 복사

원본: [deploy/nginx/y17-ph-1.wnytech.co.kr.conf](../deploy/nginx/y17-ph-1.wnytech.co.kr.conf).

앱 서버의 프로젝트 루트에서, 접속 가능한 nginx SSH 계정을 입력해 복사합니다.

```bash
read -r -p 'nginx SSH 계정: ' y17_nginx_user
scp deploy/nginx/y17-ph-1.wnytech.co.kr.conf "${y17_nginx_user}@192.168.100.116:/tmp/y17-ph-1.wnytech.co.kr.conf"
ssh "${y17_nginx_user}@192.168.100.116"
```

이후 명령은 **192.168.100.116에서** 실행합니다. 같은 이름의 설정이 이미 있으면 먼저 내용을 비교하세요. 새 사이트 파일을 설치하는 명령입니다.

```bash
sudo install -m 644 /tmp/y17-ph-1.wnytech.co.kr.conf /etc/nginx/sites-available/y17-ph-1.wnytech.co.kr
sudo ln -s /etc/nginx/sites-available/y17-ph-1.wnytech.co.kr /etc/nginx/sites-enabled/y17-ph-1.wnytech.co.kr
```

nginx에서 앱에 접근 가능한지와 인증서 이름을 먼저 확인합니다.

```bash
curl --fail --max-time 10 http://192.168.200.254:8017/api/health
curl --fail --max-time 10 -I http://192.168.200.254:8017/
sudo openssl x509 -in /etc/letsencrypt/live/wnytech.co.kr/fullchain.pem -noout -ext subjectAltName -dates
sudo nginx -t && sudo systemctl reload nginx
```

방화벽이 적용되어 있다면 `192.168.100.116 → 192.168.200.254:8017/TCP` 통신이 가능해야 합니다. nginx의 읽기 타임아웃은 60초로 설정했으며, 현재 더미 SQL 검색의 30초 제한보다 길게 두었습니다. 앱 서버의 파일 생성 실행기를 구현하거나 운영 데이터 조회 성능을 보장하는 설정은 아닙니다.

## 3. 적용 확인

```bash
curl --fail --max-time 10 https://y17-ph-1.wnytech.co.kr/api/health
curl --fail --max-time 10 -I https://y17-ph-1.wnytech.co.kr/
```

브라우저에서 `https://y17-ph-1.wnytech.co.kr`로 접속하고 **더미 로그 조회**를 눌러 검색결과를 확인합니다.

- `502`: 앱 실행·8017 바인딩·방화벽·nginx에서의 내부 curl을 확인합니다.
- 인증서 오류: 밑줄 이름을 계속 사용 중인지, SAN에 `*.wnytech.co.kr`이 있는지 확인합니다.
- 다른 사이트 표시: nginx의 `server_name`, sites-enabled 링크, 중복 사이트 경고를 확인합니다.

## 참고

React 빌드는 정적 파일로 제공합니다. Vite의 preview 서버는 운영 서버 용도가 아닙니다. [Vite 배포 문서](https://vite.dev/guide/static-deploy.html)

nginx `proxy_pass`, 전달 헤더, 연결·읽기 시간 제한 설정은 [nginx 공식 프록시 문서](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)를 기준으로 작성했습니다.
