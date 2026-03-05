// import configuration from "./configs/app.config";
import { ClassSerializerInterceptor, ValidationPipe, VersioningType } from "@nestjs/common";
import { NestFactory, Reflector } from "@nestjs/core";
import { MicroserviceOptions, Transport } from "@nestjs/microservices";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import * as cookieParser from "cookie-parser";
import * as compression from "compression";
import * as csurf from "csurf";
import * as xssClean from "xss-clean";
import * as hpp from "hpp";
import helmet from "helmet";
import { json, urlencoded } from "express";
import { ConfigService } from "@nestjs/config";
import { AppModule } from "./app.module";
import { NestExpressApplication } from "@nestjs/platform-express";
import { CorsOptions } from "@nestjs/common/interfaces/external/cors-options.interface";
// FIXME: If PostgreSQL as the session store needs to be used
// import { expressSession } from "./session-management";
// FIXME: have it if you are using secret manager
// import { loadSecretsFromAWS } from "./configs/app.config";
import { createDataSource } from "./infra/configs/ormconfig";
import { runMigrations } from "./migration-runner";

/**
 * function for bootstraping the nest application
 */
async function bootstrap() {
  // Load AWS secrets before anything else
  // FIXME: have it if you are using secret manager
  // await loadSecretsFromAWS();

  // Create the data source after secrets are loaded
  const dataSource = createDataSource();
  // Run Auto Migrations
  await runMigrations(dataSource, false); // Set to true to exit on migration failure

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // cors: true,
    bodyParser: true,
    logger: ["error", "fatal", "log", "verbose", "warn", "debug"],
  });
  const configService = app.get<ConfigService>(ConfigService);
  // const expressApp = app.getHttpAdapter() as unknown as express.Application;

  app.setGlobalPrefix("/api");
  app.enableVersioning({
    defaultVersion: "1",
    type: VersioningType.URI,
  });

  const corsOptions: CorsOptions = {
    origin: [
      "http://localhost:3000",
      // FIXME: Add Other Source URLs // Only allow requests from yourdomain.com
    ],
    methods: ["GET", "POST", "PATCH", "DELETE", "PUT", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Cache-Control", "X-Requested-With"],
    exposedHeaders: ["Content-Type", "Authorization", "Cache-Control", "X-Requested-With"],
    credentials: true,
    optionsSuccessStatus: 204,
    maxAge: 86400,
    preflightContinue: false,
  };

  app.enableCors(corsOptions);
  app.use(cookieParser());
  app.use(compression());

  app.use(json({ limit: "50kb" }));
  app.use(urlencoded({ extended: true, limit: "50kb" }));

  app.disable("x-powered-by"); // provide an extra layer of obsecurity to reduce server fingerprinting.
  app.set("trust proxy", 1); // trust first proxy

  const ignoreMethods =
    configService.get<string>("STAGE") == "dev"
      ? ["GET", "HEAD", "OPTIONS", "DELETE", "POST", "PATCH", "PUT"] // for devlopment we ignoring all
      : ["GET", "HEAD", "OPTIONS"];
  app.use(
    csurf({
      cookie: {
        httpOnly: true, // Prevent JavaScript access to the CSRF cookie
        secure: process.env.NODE_ENV === "PROD", // Set to secure only in production
        sameSite: "strict", // Restrict the cookie to same-site requests
      },
      ignoreMethods,
    })
  );
  app.use(
    helmet({
      hsts: {
        includeSubDomains: true,
        preload: true,
        maxAge: 63072000, // 2 years in seconds
      },
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          defaultSrc: ["'self'", "https://polyfill.io", "https://*.cloudflare.com", "http://127.0.0.1:3000/"],
          baseUri: ["'self'"],
          scriptSrc: [
            "'self'",
            "http://127.0.0.1:3000/",
            "https://*.cloudflare.com",
            "https://polyfill.io",
            `https: 'unsafe-inline'`, // FIXME: use script-src CSP NONCES
            /* 
              CSP NONCES https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/script-src#unsafe_inline
             */
          ],
          styleSrc: ["'self'", "https:", "http:", "'unsafe-inline'"],
          imgSrc: ["'self'", "blob:", "validator.swagger.io"],
          fontSrc: ["'self'", "https:", "data:"],
          childSrc: ["'self'", "blob:"],
          styleSrcAttr: ["'self'", "'unsafe-inline'", "http:"],
          frameSrc: ["'self'"],
        },
      },
      // you don't control the link on the pages, or know that you don't want to leak information to other domains
      dnsPrefetchControl: { allow: false }, // Changed based on the last middleware to disable DNS prefetching
      frameguard: { action: "deny" }, // Disable clickjacking
      hidePoweredBy: true, // Hides the X-Powered-By header to make the server less identifiable.
      ieNoOpen: true, // Prevents Internet Explorer from executing downloads in the site’s context.
      noSniff: true, // Prevents browsers from MIME type sniffing, reducing exposure to certain attacks.
      permittedCrossDomainPolicies: { permittedPolicies: "none" }, // Prevents Adobe Flash and Acrobat from loading cross-domain data.
      referrerPolicy: { policy: "no-referrer" }, // Protects against referrer leakage.
      xssFilter: true, // Enables the basic XSS protection in older browsers.
      // Configures Cross-Origin settings to strengthen resource isolation and mitigate certain side-channel attacks.
      crossOriginEmbedderPolicy: true,
      crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
      crossOriginResourcePolicy: { policy: "same-site" },
      originAgentCluster: true,
    })
  );

  app.use((req: any, res: any, next: any) => {
    res.setHeader(
      "Permissions-Policy",
      'fullscreen=(self), camera=(), geolocation=(self "https://*example.com"), autoplay=(), payment=(), microphone=()'
    );
    next();
  });

  app.use(xssClean());
  app.use(hpp());

  app.useGlobalPipes(new ValidationPipe({ transform: true, stopAtFirstError: true }));
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  // Apply Swagger dark mode middleware
  // app.use("/api", swaggerDarkModeMiddleware);

  /* FIXME:
    ##########################
    ##### Set-up Swagger #####
    ##########################
  */
  if (!["prod", "production"].includes(configService.get<string>("STAGE").toLowerCase())) {
    const config = new DocumentBuilder()
      .addBearerAuth()
      .setTitle(configService.get<string>("npm_package_name").replaceAll("-", " ").toUpperCase())
      .setDescription("A SaaS product that allows companies (tenants) to define approval processes.")
      .setVersion(configService.get<string>("npm_package_version"))
      .build();

    const document = SwaggerModule.createDocument(app, config, { ignoreGlobalPrefix: false });
    SwaggerModule.setup("api", app, document, {
      swaggerOptions: {
        tagsSorter: "alpha",
        docExpansion: "none",
      },
      // customCss: SWAGGER_CUSTOM_CSS,
    });
  }

  // FIXME:
  // Session Management
  // expressSession(app);

  // NATS hybrid microservice — receives @MessagePattern events from all modules
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.NATS,
    options: { servers: [process.env.NATS_URL ?? "nats://localhost:4222"] },
  });

  await app.startAllMicroservices();

  const port = configService.get<string>("PORT") || 3000;
  await app.listen(port, () => {
    console.log("Server started on port: " + port);
  });
}
bootstrap();
