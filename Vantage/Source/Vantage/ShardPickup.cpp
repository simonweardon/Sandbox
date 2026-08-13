#include "ShardPickup.h"

#include "VantageGameMode.h"

#include "Components/PointLightComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "UObject/ConstructorHelpers.h"

AShardPickup::AShardPickup()
{
	PrimaryActorTick.bCanEverTick = true;

	Pivot = CreateDefaultSubobject<USceneComponent>(TEXT("Pivot"));
	RootComponent = Pivot;

	Mesh = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Mesh"));
	Mesh->SetupAttachment(Pivot);
	Mesh->SetRelativeScale3D(FVector(0.22f, 0.22f, 0.45f));
	Mesh->SetRelativeRotation(FRotator(0.f, 0.f, 45.f));

	// Query only, and only on the visibility channel: the interaction trace must
	// find it, but the player should never bump into it.
	Mesh->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
	Mesh->SetCollisionResponseToAllChannels(ECR_Ignore);
	Mesh->SetCollisionResponseToChannel(ECC_Visibility, ECR_Block);
	Mesh->SetCastShadow(false);

	static ConstructorHelpers::FObjectFinder<UStaticMesh> CubeFinder(TEXT("/Engine/BasicShapes/Cube.Cube"));
	if (CubeFinder.Succeeded())
	{
		Mesh->SetStaticMesh(CubeFinder.Object);
	}

	Glow = CreateDefaultSubobject<UPointLightComponent>(TEXT("Glow"));
	Glow->SetupAttachment(Pivot);
	Glow->IntensityUnits = ELightUnits::Unitless;
	Glow->Intensity = 3000.f;
	Glow->AttenuationRadius = 550.f;
	Glow->CastShadows = false;
}

void AShardPickup::BeginPlay()
{
	Super::BeginPlay();

	if (UMaterialInstanceDynamic* Material = Mesh->CreateAndSetMaterialInstanceDynamic(0))
	{
		Material->SetVectorParameterValue(TEXT("Color"), Tint);
	}
	Glow->SetLightColor(Tint);

	// Stagger the bob so a room full of shards does not pulse in lockstep.
	Phase = FMath::Fmod(GetActorLocation().X + GetActorLocation().Y, 360.f);
}

void AShardPickup::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	Phase += DeltaSeconds;
	Pivot->AddLocalRotation(FRotator(0.f, 55.f * DeltaSeconds, 0.f));
	Mesh->SetRelativeLocation(FVector(0.f, 0.f, FMath::Sin(Phase * 1.8f) * 7.f));
}

FText AShardPickup::GetInteractionPrompt() const
{
	return FText::FromString(TEXT("[E]  Take resonance shard"));
}

void AShardPickup::Interact(AVantageCharacter* Interactor)
{
	if (AVantageGameMode* GameMode = GetWorld()->GetAuthGameMode<AVantageGameMode>())
	{
		GameMode->CollectShard();
	}
	Destroy();
}
