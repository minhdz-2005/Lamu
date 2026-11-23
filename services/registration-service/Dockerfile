# 5.1 — multi-stage: Maven build → JRE 21 runtime (kiến trúc §6 tuần 4, LG Ch8 §1).
# Build context là thư mục service: docker compose build registration-service
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build

# pom trước để layer cache: đổi source không tải lại dependency.
COPY pom.xml ./
RUN mvn -B -q -DskipTests dependency:go-offline

COPY src ./src
RUN mvn -B -q -DskipTests package

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app

# Chạy user không phải root: không có gì trong container cần ghi.
RUN addgroup -S luma && adduser -S -G luma luma
COPY --from=build /build/target/registration-service-*.jar app.jar
USER luma

EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=6 \
  CMD wget -qO- http://127.0.0.1:8080/healthz > /dev/null || exit 1

ENTRYPOINT ["java", "-jar", "/app/app.jar"]
