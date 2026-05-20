FROM alpine:3.20

RUN apk add --no-cache curl tini tzdata && \
    cp /usr/share/zoneinfo/Asia/Seoul /etc/localtime && \
    echo "Asia/Seoul" > /etc/timezone

COPY crontab /etc/crontabs/root
COPY notify.sh /usr/local/bin/notify.sh
RUN chmod +x /usr/local/bin/notify.sh

ENV TZ=Asia/Seoul

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["crond", "-f", "-l", "2"]
