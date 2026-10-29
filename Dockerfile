# صورة خفيفة لتشغيل موقع Burger House (خادم Node ثابت بلا أي تبعيات)
FROM node:22-alpine

# إعدادات التشغيل: المنفذ 3000 والاستماع على كل الواجهات ليعمل خلف منصّة النشر
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0

WORKDIR /app

# لا توجد تبعيات إنتاج (الخادم مكتوب بـ Node فقط)
COPY package.json ./
COPY server.js ./
COPY public ./public

EXPOSE 3000

# التشغيل بمستخدم غير جذري
USER node

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
