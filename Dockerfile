# 游雁学院 - Dockerfile
FROM node:20-alpine

WORKDIR /app

# 安装依赖
COPY package*.json ./
RUN npm ci --only=production

# 复制应用代码
COPY . .

# 创建数据目录
RUN mkdir -p data

# 暴露端口
EXPOSE 3003

# 启动命令
CMD ["node", "server.js"]
