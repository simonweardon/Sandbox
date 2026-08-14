#include "RobotDog.h"

#include "VantageCharacter.h"
#include "ZombieCharacter.h"

#include "Components/CapsuleComponent.h"
#include "Components/PointLightComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/PlayerController.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "UObject/ConstructorHelpers.h"

namespace
{
	constexpr float MeshHalfSize = 50.f;
	constexpr float DogCapsuleHalfHeight = 34.f;

	const FLinearColor ShellColour (0.215f, 0.230f, 0.255f);
	const FLinearColor PlateColour (0.115f, 0.125f, 0.140f);
	const FLinearColor JointColour (0.075f, 0.080f, 0.090f);
	const FLinearColor EyeColour   (0.20f, 0.95f, 1.f);
	const FLinearColor AngryColour (1.f, 0.32f, 0.10f);
	const FLinearColor DeadColour  (0.35f, 0.35f, 0.35f);
}

ARobotDog::ARobotDog()
{
	PrimaryActorTick.bCanEverTick = true;

	UCapsuleComponent* Capsule = GetCapsuleComponent();
	Capsule->InitCapsuleSize(24.f, DogCapsuleHalfHeight);
	// It is a companion, not cover: the player should never be blocked by it,
	// and the gun should never be stopped by it either.
	Capsule->SetCollisionResponseToChannel(ECC_Visibility, ECR_Ignore);
	Capsule->SetCollisionResponseToChannel(ECC_Pawn, ECR_Overlap);

	bUseControllerRotationYaw = false;

	UCharacterMovementComponent* Movement = GetCharacterMovement();
	Movement->bOrientRotationToMovement = true;
	Movement->RotationRate = FRotator(0.f, 620.f, 0.f);
	Movement->MaxWalkSpeed = 620.f;
	Movement->MaxAcceleration = 2400.f;
	Movement->BrakingDecelerationWalking = 1800.f;
	Movement->SetWalkableFloorAngle(55.f);
	// Same trap the zombies fell into: no Controller means CharacterMovement
	// never consumes the input vector at all.
	Movement->bRunPhysicsWithNoController = true;

	static ConstructorHelpers::FObjectFinder<UStaticMesh> CubeFinder(TEXT("/Engine/BasicShapes/Cube.Cube"));
	static ConstructorHelpers::FObjectFinder<UStaticMesh> CylinderFinder(TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));
	static ConstructorHelpers::FObjectFinder<UStaticMesh> SphereFinder(TEXT("/Engine/BasicShapes/Sphere.Sphere"));

	UStaticMesh* Cube = CubeFinder.Succeeded() ? CubeFinder.Object : nullptr;
	UStaticMesh* Cylinder = CylinderFinder.Succeeded() ? CylinderFinder.Object : nullptr;
	UStaticMesh* Sphere = SphereFinder.Succeeded() ? SphereFinder.Object : nullptr;

	BodyRoot = CreateDefaultSubobject<USceneComponent>(TEXT("BodyRoot"));
	BodyRoot->SetupAttachment(Capsule);

	Chassis = AddPart(TEXT("Chassis"), BodyRoot, FVector(0.f, 0.f, 4.f), FVector(27.f, 13.f, 11.f), FRotator::ZeroRotator, Cube);
	Plate   = AddPart(TEXT("Plate"),   BodyRoot, FVector(-4.f, 0.f, 16.f), FVector(19.f, 14.f, 4.f), FRotator::ZeroRotator, Cube);

	Neck = CreateDefaultSubobject<USceneComponent>(TEXT("Neck"));
	Neck->SetupAttachment(BodyRoot);
	Neck->SetRelativeLocation(FVector(26.f, 0.f, 8.f));

	Head  = AddPart(TEXT("Head"),  Neck, FVector(7.f, 0.f, 4.f),  FVector(11.f, 9.f, 9.f), FRotator::ZeroRotator, Cube);
	Snout = AddPart(TEXT("Snout"), Neck, FVector(21.f, 0.f, 1.f), FVector(8.f, 5.5f, 4.f), FRotator::ZeroRotator, Cube);
	Jaw   = AddPart(TEXT("Jaw"),   Neck, FVector(21.f, 0.f, -6.f), FVector(8.f, 5.f, 2.5f), FRotator::ZeroRotator, Cube);

	EyeLens = AddPart(TEXT("EyeLens"), Neck, FVector(15.f, 0.f, 9.f), FVector(4.f, 4.f, 4.f), FRotator::ZeroRotator, Sphere);

	Tail    = AddPart(TEXT("Tail"),    BodyRoot, FVector(-32.f, 0.f, 14.f), FVector(12.f, 2.5f, 2.5f), FRotator(-22.f, 0.f, 0.f), Cube);
	Antenna = AddPart(TEXT("Antenna"), BodyRoot, FVector(-12.f, 0.f, 30.f), FVector(1.5f, 1.5f, 12.f), FRotator(0.f, 0.f, 0.f), Cylinder);

	// Four legs, front pair and rear pair, hung from hips so they swing about
	// the shoulder rather than about their middle.
	const FVector Hips[4] = {
		FVector(17.f, -13.f, -6.f),
		FVector(17.f, 13.f, -6.f),
		FVector(-17.f, -13.f, -6.f),
		FVector(-17.f, 13.f, -6.f)
	};

	const TCHAR* JointNames[4] = { TEXT("LegFL"), TEXT("LegFR"), TEXT("LegRL"), TEXT("LegRR") };
	const TCHAR* BoneNames[4]  = { TEXT("BoneFL"), TEXT("BoneFR"), TEXT("BoneRL"), TEXT("BoneRR") };

	for (int32 Index = 0; Index < 4; ++Index)
	{
		USceneComponent* Joint = CreateDefaultSubobject<USceneComponent>(JointNames[Index]);
		Joint->SetupAttachment(BodyRoot);
		Joint->SetRelativeLocation(Hips[Index]);
		LegJoints.Add(Joint);

		UStaticMeshComponent* Bone = AddPart(BoneNames[Index], Joint, FVector(0.f, 0.f, -13.f), FVector(4.5f, 4.5f, 13.f), FRotator::ZeroRotator, Cube);
		LegBones.Add(Bone);
	}

	Eye = CreateDefaultSubobject<UPointLightComponent>(TEXT("Eye"));
	Eye->SetupAttachment(Neck);
	Eye->SetRelativeLocation(FVector(22.f, 0.f, 9.f));
	Eye->IntensityUnits = ELightUnits::Unitless;
	Eye->Intensity = 2400.f;
	Eye->AttenuationRadius = 900.f;
	Eye->CastShadows = false;

	GetMesh()->SetVisibility(false);
	GetMesh()->SetCollisionEnabled(ECollisionEnabled::NoCollision);
}

UStaticMeshComponent* ARobotDog::AddPart(const TCHAR* Name, USceneComponent* Parent, const FVector& Location, const FVector& HalfExtent, const FRotator& Rotation, UStaticMesh* Mesh)
{
	UStaticMeshComponent* Part = CreateDefaultSubobject<UStaticMeshComponent>(Name);
	Part->SetupAttachment(Parent);
	Part->SetRelativeLocation(Location);
	Part->SetRelativeRotation(Rotation);
	Part->SetRelativeScale3D(HalfExtent / MeshHalfSize);
	Part->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	if (Mesh)
	{
		Part->SetStaticMesh(Mesh);
	}
	return Part;
}

void ARobotDog::BeginPlay()
{
	Super::BeginPlay();

	Health = MaxHealth;

	auto Tint = [](UStaticMeshComponent* Part, const FLinearColor& Colour) -> UMaterialInstanceDynamic*
	{
		if (!Part)
		{
			return nullptr;
		}
		UMaterialInstanceDynamic* Material = Part->CreateAndSetMaterialInstanceDynamic(0);
		if (Material)
		{
			Material->SetVectorParameterValue(TEXT("Color"), Colour);
		}
		return Material;
	};

	Tint(Chassis, ShellColour);
	Tint(Plate, PlateColour);
	Tint(Head, ShellColour);
	Tint(Snout, PlateColour);
	Tint(Jaw, PlateColour);
	Tint(Tail, PlateColour);
	Tint(Antenna, JointColour);
	EyeMaterial = Tint(EyeLens, EyeColour);

	for (UStaticMeshComponent* Bone : LegBones)
	{
		Tint(Bone, JointColour);
	}

	Eye->SetLightColor(EyeColour);
}

AZombieCharacter* ARobotDog::FindQuarry() const
{
	const APlayerController* PC = GetWorld()->GetFirstPlayerController();
	const APawn* Player = PC ? PC->GetPawn() : nullptr;
	if (!Player)
	{
		return nullptr;
	}

	const FVector Anchor = Player->GetActorLocation();

	AZombieCharacter* Best = nullptr;
	float BestDistanceSquared = LeashRange * LeashRange;

	for (TActorIterator<AZombieCharacter> It(GetWorld()); It; ++It)
	{
		if (It->IsDead())
		{
			continue;
		}

		// Measured from the player, not from the dog: leashing it to the player
		// is what keeps it from running off across the desert.
		const float DistanceSquared = FVector::DistSquared2D(Anchor, It->GetActorLocation());
		if (DistanceSquared < BestDistanceSquared)
		{
			BestDistanceSquared = DistanceSquared;
			Best = *It;
		}
	}

	return Best;
}

void ARobotDog::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	BiteCooldown = FMath::Max(BiteCooldown - DeltaSeconds, 0.f);
	BiteLunge = FMath::Max(BiteLunge - DeltaSeconds * 3.6f, 0.f);

	if (State == EDogState::Rebooting)
	{
		RebootLeft -= DeltaSeconds;
		if (RebootLeft <= 0.f)
		{
			State = EDogState::Heel;
			Health = MaxHealth;
			if (EyeMaterial)
			{
				EyeMaterial->SetVectorParameterValue(TEXT("Color"), EyeColour);
			}
			Eye->SetLightColor(EyeColour);
			Eye->SetIntensity(2400.f);
		}
		Animate(DeltaSeconds);
		return;
	}

	AZombieCharacter* Quarry = FindQuarry();

	if (Quarry)
	{
		State = EDogState::Hunt;
		Hunt(DeltaSeconds, Quarry);
	}
	else
	{
		State = EDogState::Heel;
		Heel(DeltaSeconds);
	}

	Animate(DeltaSeconds);
}

void ARobotDog::Heel(float DeltaSeconds)
{
	const APlayerController* PC = GetWorld()->GetFirstPlayerController();
	const APawn* Player = PC ? PC->GetPawn() : nullptr;
	if (!Player)
	{
		return;
	}

	FVector ToPlayer = Player->GetActorLocation() - GetActorLocation();
	const float Distance = ToPlayer.Size2D();
	ToPlayer.Z = 0.f;

	// A dead zone, or it jitters against the player's back forever.
	if (Distance < HeelDistance || !ToPlayer.Normalize())
	{
		return;
	}

	// Closes hard when it has fallen a long way behind, ambles when close.
	const float Urgency = FMath::GetMappedRangeValueClamped(
		FVector2D(HeelDistance, HeelDistance * 4.f), FVector2D(0.35f, 1.f), Distance);

	AddMovementInput(ToPlayer, Urgency);
}

void ARobotDog::Hunt(float DeltaSeconds, AZombieCharacter* Quarry)
{
	FVector ToQuarry = Quarry->GetActorLocation() - GetActorLocation();
	const float Distance = ToQuarry.Size2D();
	ToQuarry.Z = 0.f;

	if (!ToQuarry.Normalize())
	{
		return;
	}

	AddMovementInput(ToQuarry, 1.f);

	if (Distance <= BiteRange && BiteCooldown <= 0.f)
	{
		BiteCooldown = BiteInterval;
		BiteLunge = 1.f;
		Quarry->ApplyHit(BiteDamage, false);
	}
}

void ARobotDog::TakeZombieHit(float Damage)
{
	if (State == EDogState::Rebooting)
	{
		return;
	}

	Health -= Damage;
	if (Health > 0.f)
	{
		return;
	}

	State = EDogState::Rebooting;
	RebootLeft = RebootSeconds;
	GetCharacterMovement()->StopMovementImmediately();

	if (EyeMaterial)
	{
		EyeMaterial->SetVectorParameterValue(TEXT("Color"), DeadColour);
	}
	Eye->SetIntensity(0.f);
}

void ARobotDog::Animate(float DeltaSeconds)
{
	const float Speed = GetVelocity().Size2D();

	if (State == EDogState::Rebooting)
	{
		// Collapsed on its belly, legs splayed, until it comes back up.
		BodyRoot->SetRelativeLocation(FMath::VInterpTo(BodyRoot->GetRelativeLocation(), FVector(0.f, 0.f, -16.f), DeltaSeconds, 4.f));
		BodyRoot->SetRelativeRotation(FMath::RInterpTo(BodyRoot->GetRelativeRotation(), FRotator(0.f, 0.f, 62.f), DeltaSeconds, 4.f));
		return;
	}

	BodyRoot->SetRelativeLocation(FVector(0.f, 0.f, 0.f));

	// Gait rate follows speed, so it trots when close and gallops when chasing.
	Gait += DeltaSeconds * (3.f + Speed * 0.032f);
	const float Blend = FMath::Clamp(Speed / 380.f, 0.f, 1.4f);

	// Diagonal pairs, the way a real quadruped trots: front-left with rear-right.
	const float SwingA = FMath::Sin(Gait) * 38.f * Blend;
	const float SwingB = FMath::Sin(Gait + PI) * 38.f * Blend;

	if (LegJoints.Num() == 4)
	{
		LegJoints[0]->SetRelativeRotation(FRotator(SwingA, 0.f, 0.f));
		LegJoints[1]->SetRelativeRotation(FRotator(SwingB, 0.f, 0.f));
		LegJoints[2]->SetRelativeRotation(FRotator(SwingB, 0.f, 0.f));
		LegJoints[3]->SetRelativeRotation(FRotator(SwingA, 0.f, 0.f));
	}

	// Body dips and rises at twice the stride, plus the lunge when it bites.
	const float Bob = FMath::Sin(Gait * 2.f) * 2.2f * Blend;
	BodyRoot->SetRelativeLocation(FVector(BiteLunge * 12.f, 0.f, Bob));
	BodyRoot->SetRelativeRotation(FRotator(BiteLunge * 16.f - Blend * 5.f, 0.f, 0.f));

	// Head dips into the bite; the jaw snaps with it.
	if (Neck)
	{
		Neck->SetRelativeRotation(FRotator(BiteLunge * 26.f, 0.f, 0.f));
	}
	if (Jaw)
	{
		Jaw->SetRelativeLocation(FVector(21.f, 0.f, -6.f - BiteLunge * 5.f));
	}

	// Wags when heeling, holds rigid when hunting.
	const bool bHunting = State == EDogState::Hunt;
	TailWag += DeltaSeconds * (bHunting ? 2.f : 9.f);
	if (Tail)
	{
		Tail->SetRelativeRotation(FRotator(-22.f, FMath::Sin(TailWag) * (bHunting ? 6.f : 26.f), 0.f));
	}

	// Eye burns orange on the hunt and cyan at heel.
	const FLinearColor Target = bHunting ? AngryColour : EyeColour;
	if (EyeMaterial)
	{
		EyeMaterial->SetVectorParameterValue(TEXT("Color"), Target);
	}
	Eye->SetLightColor(Target);
	Eye->SetIntensity(2400.f * (bHunting ? 1.8f : 1.f) * (1.f + BiteLunge));
}
