#include "ShardPickup.h"

#include "VantageGameMode.h"

#include "Components/PointLightComponent.h"
#include "Components/SphereComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "UObject/ConstructorHelpers.h"

namespace
{
	/** Half height and radius of each of the two cones forming the crystal. */
	constexpr float ShardHalfHeight = 17.f;
	constexpr float ShardRadius = 10.f;
	constexpr float MeshHalfSize = 50.f;
}

AShardPickup::AShardPickup()
{
	PrimaryActorTick.bCanEverTick = true;

	Pivot = CreateDefaultSubobject<USceneComponent>(TEXT("Pivot"));
	RootComponent = Pivot;

	// A dedicated sphere carries the interaction trace rather than the meshes,
	// so the shard stays easy to put the crosshair on however thin it looks.
	Probe = CreateDefaultSubobject<USphereComponent>(TEXT("Probe"));
	Probe->SetupAttachment(Pivot);
	Probe->InitSphereRadius(46.f);
	Probe->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
	Probe->SetCollisionResponseToAllChannels(ECR_Ignore);
	Probe->SetCollisionResponseToChannel(ECC_Visibility, ECR_Block);

	static ConstructorHelpers::FObjectFinder<UStaticMesh> ConeFinder(TEXT("/Engine/BasicShapes/Cone.Cone"));

	const FVector ConeScale(
		ShardRadius / MeshHalfSize,
		ShardRadius / MeshHalfSize,
		ShardHalfHeight / MeshHalfSize);

	// Two cones base to base make a bipyramid, which reads as a crystal from any
	// angle. A single cube never does, however you rotate it.
	auto MakeCone = [&](const TCHAR* Name, float Z, const FRotator& Rotation) -> UStaticMeshComponent*
	{
		UStaticMeshComponent* Cone = CreateDefaultSubobject<UStaticMeshComponent>(Name);
		Cone->SetupAttachment(Pivot);
		Cone->SetRelativeLocation(FVector(0.f, 0.f, Z));
		Cone->SetRelativeRotation(Rotation);
		Cone->SetRelativeScale3D(ConeScale);
		Cone->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		Cone->SetCastShadow(false);
		if (ConeFinder.Succeeded())
		{
			Cone->SetStaticMesh(ConeFinder.Object);
		}
		return Cone;
	};

	UpperCone = MakeCone(TEXT("UpperCone"), ShardHalfHeight, FRotator::ZeroRotator);
	LowerCone = MakeCone(TEXT("LowerCone"), -ShardHalfHeight, FRotator(0.f, 0.f, 180.f));

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

	for (UStaticMeshComponent* Cone : { UpperCone.Get(), LowerCone.Get() })
	{
		if (UMaterialInstanceDynamic* Material = Cone->CreateAndSetMaterialInstanceDynamic(0))
		{
			Material->SetVectorParameterValue(TEXT("Color"), Tint);
		}
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

	const float Bob = FMath::Sin(Phase * 1.8f) * 7.f;
	UpperCone->SetRelativeLocation(FVector(0.f, 0.f, ShardHalfHeight + Bob));
	LowerCone->SetRelativeLocation(FVector(0.f, 0.f, -ShardHalfHeight + Bob));
	Glow->SetIntensity(3000.f * (1.f + FMath::Sin(Phase * 2.4f) * 0.18f));
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
