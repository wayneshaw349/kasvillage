use actix_web::{web, App, HttpServer, HttpResponse, Responder};

async fn health_check() -> impl Responder {
    HttpResponse::Ok().body("KasVillage L2 Frontend is Running on Flux!")
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    println!("Starting KasVillage L2 Frontend...");
    
    HttpServer::new(|| {
        App::new()
            .route("/", web::get().to(health_check))
            .route("/api/health", web::get().to(health_check))
    })
    .bind(("0.0.0.0", 8080))?
    .run()
    .await
}
